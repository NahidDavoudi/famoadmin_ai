import {
  VALID_ACADEMIC_FIELDS,
  VALID_GRADES,
  isValidIranianPhone,
  isValidNationalIdChecksum,
  normalizeIranianPhone,
} from './exam-math';
import type { AcademicField, OpenApiEnvelope } from '../types';

export interface CacheEntry<T = unknown> {
  key: string;
  group: string;
  value: T;
  expiresAt: number;
  createdAt: number;
  ttlSeconds: number;
}

export interface CacheGroupStats {
  group: string;
  hits: number;
  misses: number;
  flushes: number;
  lastFlushedAt: string | null;
  activeKeys: Array<{
    key: string;
    ttlRemainingSeconds: number;
    layer: 'http' | 'service' | 'views';
  }>;
}

/**
 * Implements FAMO PublicCacheMiddleware & Cache service guarantees:
 * - Service-layer cache (600s TTL) and HTTP JSON cache (300s TTL) in 'public' group
 * - Atomic blog post view counters (`blog_post_views:{id}`)
 * - `flushGroup('public')` invalidation on admin mutations
 */
export class FamoPublicCache {
  private entries = new Map<string, CacheEntry>();
  private postViews = new Map<number, number>();
  private hits = 0;
  private misses = 0;
  private flushes = 0;
  private lastFlushedAt: string | null = null;

  get<T = unknown>(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (now >= entry.expiresAt) {
      this.entries.delete(key);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value as T;
  }

  peek<T = unknown>(key: string, now = Date.now()): T | null {
    const entry = this.entries.get(key);
    if (!entry || now >= entry.expiresAt) {
      if (entry) this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T = unknown>(key: string, value: T, ttlSeconds = 300, group = 'public', now = Date.now()): void {
    this.entries.set(key, {
      key,
      group,
      value,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      ttlSeconds,
    });
  }

  flushGroup(group = 'public'): number {
    let removed = 0;
    for (const [k, entry] of this.entries.entries()) {
      if (entry.group === group) {
        this.entries.delete(k);
        removed++;
      }
    }
    this.flushes++;
    this.lastFlushedAt = new Date().toISOString();
    return removed;
  }

  incrementBlogView(postId: number, currentDbViews: number): number {
    const base = this.postViews.has(postId) ? this.postViews.get(postId)! : currentDbViews;
    const next = base + 1;
    this.postViews.set(postId, next);
    return next;
  }

  getBlogViews(postId: number, fallbackViews: number): number {
    return this.postViews.has(postId) ? this.postViews.get(postId)! : fallbackViews;
  }

  getStats(now = Date.now()): CacheGroupStats {
    const activeKeys: CacheGroupStats['activeKeys'] = [];
    for (const [key, entry] of this.entries.entries()) {
      if (now < entry.expiresAt) {
        const ttlRemainingSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
        const layer = key.startsWith('http:')
          ? 'http'
          : key.startsWith('blog_post_views:')
            ? 'views'
            : 'service';
        activeKeys.push({ key, ttlRemainingSeconds, layer });
      } else {
        this.entries.delete(key);
      }
    }
    for (const [postId] of this.postViews.entries()) {
      activeKeys.push({
        key: `blog_post_views:${postId}`,
        ttlRemainingSeconds: 600,
        layer: 'views',
      });
    }
    return {
      group: 'public',
      hits: this.hits,
      misses: this.misses,
      flushes: this.flushes,
      lastFlushedAt: this.lastFlushedAt,
      activeKeys,
    };
  }
}

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfter?: number;
  attemptsKey: string;
  lockKey: string;
}

/**
 * Simple deterministic hash for IP rate-limiting keys (portable across Node & Browser)
 */
export function hashIpIdentifier(ip: string): string {
  let h1 = 0xdeadbeef ^ ip.length;
  let h2 = 0x41c6ce57 ^ ip.length;
  for (let i = 0, ch; i < ip.length; i++) {
    ch = ip.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Implements RateLimitMiddleware & RateLimiter guarantees:
 * - Keys: `rl:attempts:public:ip:{sha256(ip)}` and `rl:lock:public:ip:{sha256(ip)}`
 * - Defaults: PUBLIC_RATE_LIMIT_MAX_ATTEMPTS=60, WINDOW=60s, LOCKOUT=60s
 */
export class FamoRateLimiter {
  private attempts = new Map<string, { count: number; expiresAt: number }>();
  private locks = new Map<string, number>();

  constructor(
    public maxAttempts = 60,
    public windowSeconds = 60,
    public lockoutSeconds = 60
  ) {}

  check(ip = '127.0.0.1', now = Date.now()): RateLimitCheckResult {
    const hash = hashIpIdentifier(ip);
    const attemptsKey = `rl:attempts:public:ip:${hash}`;
    const lockKey = `rl:lock:public:ip:${hash}`;

    const lockExpires = this.locks.get(lockKey);
    if (lockExpires && now < lockExpires) {
      const retryAfter = Math.max(1, Math.ceil((lockExpires - now) / 1000));
      return {
        allowed: false,
        limit: this.maxAttempts,
        remaining: 0,
        retryAfter,
        attemptsKey,
        lockKey,
      };
    } else if (lockExpires) {
      this.locks.delete(lockKey);
    }

    let current = this.attempts.get(attemptsKey);
    if (!current || now >= current.expiresAt) {
      current = { count: 0, expiresAt: now + this.windowSeconds * 1000 };
    }

    current.count += 1;
    this.attempts.set(attemptsKey, current);

    if (current.count > this.maxAttempts) {
      const lockUntil = now + this.lockoutSeconds * 1000;
      this.locks.set(lockKey, lockUntil);
      return {
        allowed: false,
        limit: this.maxAttempts,
        remaining: 0,
        retryAfter: this.lockoutSeconds,
        attemptsKey,
        lockKey,
      };
    }

    return {
      allowed: true,
      limit: this.maxAttempts,
      remaining: Math.max(0, this.maxAttempts - current.count),
      attemptsKey,
      lockKey,
    };
  }

  resetAll(): void {
    this.attempts.clear();
    this.locks.clear();
  }
}

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Validates `page` and `per_page` parameters on public blog endpoints (`422 VALIDATION_ERROR`).
 */
export function validatePublicPaginationParams(
  rawPage?: unknown,
  rawPerPage?: unknown
): ValidationResult<{ page: number; per_page: number }> {
  let page = 1;
  if (rawPage !== undefined && rawPage !== null && rawPage !== '') {
    const str = String(rawPage).trim();
    if (!/^-?\d+$/.test(str)) {
      return {
        valid: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'شماره صفحه باید یک عدد صحیح مثبت باشد',
        },
      };
    }
    page = parseInt(str, 10);
    if (!Number.isInteger(page) || page < 1) {
      return {
        valid: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'شماره صفحه باید یک عدد صحیح مثبت باشد',
        },
      };
    }
  }

  let perPage = 20;
  if (rawPerPage !== undefined && rawPerPage !== null && rawPerPage !== '') {
    const str = String(rawPerPage).trim();
    if (!/^-?\d+$/.test(str)) {
      return {
        valid: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'تعداد آیتم در هر صفحه باید عددی بین ۱ تا ۵۰ باشد',
        },
      };
    }
    perPage = parseInt(str, 10);
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 50) {
      return {
        valid: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'تعداد آیتم در هر صفحه باید عددی بین ۱ تا ۵۰ باشد',
        },
      };
    }
  }

  return { valid: true, value: { page, per_page: perPage } };
}

export function validateBlogSlug(slugRaw: unknown): ValidationResult<string> {
  if (typeof slugRaw !== 'string') {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'اسلاگ پست نامعتبر است' },
    };
  }
  const slug = slugRaw.trim();
  if (slug.length < 1 || slug.length > 255) {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'طول اسلاگ باید بین ۱ تا ۲۵۵ کاراکتر باشد' },
    };
  }
  return { valid: true, value: slug };
}

export function validateBlogCategorySlug(categoryRaw: unknown): ValidationResult<string> {
  if (typeof categoryRaw !== 'string') {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'اسلاگ دسته‌بندی نامعتبر است' },
    };
  }
  const category = categoryRaw.trim();
  if (category.length < 1 || category.length > 100) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'طول اسلاگ دسته‌بندی باید بین ۱ تا ۱۰۰ کاراکتر باشد',
      },
    };
  }
  return { valid: true, value: category };
}

export interface RegisterRequestPayload {
  phone: string;
  password: string;
  nationalId: string;
  grade: number;
  field: AcademicField;
  name: string;
}

/**
 * Validates `POST /api/v1/auth/register` according to OpenAPI 3.1.0 schema:
 * - phone: Iranian mobile format (`^(\+98|0098|98|0)?9[0-9]{9}$`)
 * - password: minLength 4
 * - nationalId: 10-digit Iranian National ID passing checksum validation
 * - grade: integer in [7, 8, 9, 10, 11, 12]
 * - field: string in [ریاضی, تجربی, انسانی, زبان, هنر, عمومی, راهنمایی]
 * - name: string (2..150 chars)
 */
export function validateRegistrationPayload(body: unknown): ValidationResult<RegisterRequestPayload> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'بدنه درخواست باید یک شیء JSON معتبر باشد' },
    };
  }

  const raw = body as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (name.length < 2 || name.length > 150) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'نام و نام خانوادگی باید بین ۲ تا ۱۵۰ کاراکتر باشد',
      },
    };
  }

  const phoneRaw = typeof raw.phone === 'string' ? raw.phone.trim() : '';
  if (!isValidIranianPhone(phoneRaw)) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'شماره موبایل وارد شده معتبر نیست (فرمت مجاز: 09XXXXXXXXX)',
      },
    };
  }

  const password = typeof raw.password === 'string' ? raw.password : '';
  if (password.length < 4) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'رمز عبور باید حداقل ۴ کاراکتر باشد',
      },
    };
  }

  const nationalId = typeof raw.nationalId === 'string' ? raw.nationalId.trim() : '';
  if (!isValidNationalIdChecksum(nationalId)) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'کد ملی ۱۰ رقمی معتبر نیست (بررسی رقم کنترلی ناموفق بود)',
      },
    };
  }

  const grade = typeof raw.grade === 'number' ? raw.grade : Number(raw.grade);
  if (!Number.isInteger(grade) || !VALID_GRADES.includes(grade)) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'پایه تحصیلی باید یکی از مقادیر ۷، ۸، ۹، ۱۰، ۱۱ یا ۱۲ باشد',
      },
    };
  }

  const field = typeof raw.field === 'string' ? (raw.field.trim() as AcademicField) : ('' as AcademicField);
  if (!VALID_ACADEMIC_FIELDS.includes(field)) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'رشته تحصیلی انتخاب شده معتبر نیست',
      },
    };
  }

  return {
    valid: true,
    value: {
      name,
      phone: normalizeIranianPhone(phoneRaw),
      password,
      nationalId,
      grade,
      field,
    },
  };
}

export function validateLoginPayload(
  body: unknown
): ValidationResult<{ username: string; password: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'بدنه درخواست باید یک شیء JSON معتبر باشد' },
    };
  }
  const raw = body as Record<string, unknown>;
  const username = typeof raw.username === 'string' ? raw.username.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';

  if (!username || !password) {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'نام کاربری و رمز عبور الزامی هستند' },
    };
  }

  return { valid: true, value: { username, password } };
}

export function validateVerify2faPayload(
  body: unknown
): ValidationResult<{ user_id: number; code: string }> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valid: false,
      error: { code: 'VALIDATION_ERROR', message: 'بدنه درخواست باید یک شیء JSON معتبر باشد' },
    };
  }
  const raw = body as Record<string, unknown>;
  const userId = typeof raw.user_id === 'number' ? raw.user_id : Number(raw.user_id);
  const code = typeof raw.code === 'string' ? raw.code.trim() : '';

  if (!Number.isInteger(userId) || userId < 1 || !code) {
    return {
      valid: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'شناسه کاربر (عدد صحیح مثبت) و کد تایید دو مرحله‌ای الزامی هستند',
      },
    };
  }

  return { valid: true, value: { user_id: userId, code } };
}

export function makeSuccessEnvelope<T>(
  data: T,
  pagination: OpenApiEnvelope<T>['pagination'] = null
): OpenApiEnvelope<T> {
  return {
    success: true,
    data,
    pagination,
    error: null,
  };
}

export function makeErrorEnvelope(code: string, message: string): OpenApiEnvelope<null> {
  return {
    success: false,
    data: null,
    pagination: null,
    error: {
      code,
      message,
    },
  };
}
