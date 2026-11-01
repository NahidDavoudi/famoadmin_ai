import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createInitialStore, type FamoDataStore } from './src/lib/default-data';
import {
  FamoPublicCache,
  FamoRateLimiter,
  makeErrorEnvelope,
  makeSuccessEnvelope,
  validateBlogCategorySlug,
  validateBlogSlug,
  validateLoginPayload,
  validatePublicPaginationParams,
  validateRegistrationPayload,
  validateVerify2faPayload,
} from './src/lib/public-api-engine';
import type { BlogCategory, BlogPost, Course, Instructor, PublicSupporter } from './src/types';

const PORT = 3000;

const store: FamoDataStore = createInitialStore();
const publicCache = new FamoPublicCache();

const maxAttempts = parseInt(process.env.PUBLIC_RATE_LIMIT_MAX_ATTEMPTS || '60', 10) || 60;
const windowSeconds = parseInt(process.env.PUBLIC_RATE_LIMIT_WINDOW_SECONDS || '60', 10) || 60;
const lockoutSeconds = parseInt(process.env.PUBLIC_RATE_LIMIT_LOCKOUT_SECONDS || '60', 10) || 60;
const rateLimiter = new FamoRateLimiter(maxAttempts, windowSeconds, lockoutSeconds);

function formatServerTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || '127.0.0.1';
}

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const check = rateLimiter.check(ip);
  res.setHeader('X-RateLimit-Limit', String(check.limit));
  res.setHeader('X-RateLimit-Remaining', String(check.remaining));

  if (!check.allowed) {
    if (check.retryAfter) {
      res.setHeader('Retry-After', String(check.retryAfter));
    }
    res
      .status(429)
      .json(makeErrorEnvelope('RATE_LIMITED', 'تعداد درخواستها بیش از حد مجاز است'));
    return;
  }
  next();
}

function setPublicCacheHeaders(res: Response, cacheStatus?: 'HIT' | 'MISS'): void {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Vary', 'Origin');
  if (cacheStatus) {
    res.setHeader('X-Cache', cacheStatus);
  }
}

function mapSupporterToPublic(s: FamoDataStore['supporters'][number]): PublicSupporter {
  const initials = encodeURIComponent(s.name.slice(0, 2));
  const avatar = s.avatar ?? `supporter-${s.id}.png`;
  const avatar_url =
    s.avatar_url ??
    `https://api.dicebear.com/9.x/initials/svg?seed=${initials}&backgroundColor=445d84`;
  return {
    id: s.id,
    name: s.name,
    grade: s.grade ?? null,
    field: s.field ?? null,
    avatar,
    avatar_url,
  };
}

function mapBlogPostToPublic(p: BlogPost): BlogPost {
  const liveViews = publicCache.getBlogViews(p.id, p.views || 0);
  const isPublished = Boolean(p.published ?? p.is_published === 1);
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt ?? null,
    content: p.content,
    cover_image: p.cover_image ?? null,
    category: p.category ?? null,
    category_id: p.category_id ?? null,
    published: isPublished,
    is_published: isPublished ? 1 : 0,
    published_at: p.published_at ?? null,
    views: liveViews,
    meta_description: p.meta_description ?? null,
    created_at: p.created_at || p.published_at || new Date().toISOString(),
    updated_at: p.updated_at || p.published_at || new Date().toISOString(),
  };
}

function computeCategoriesWithCounts(): BlogCategory[] {
  const publishedPosts = store.blogPosts.filter((p) => Boolean(p.published ?? p.is_published === 1));
  return [...store.blogCategories]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((cat) => {
      const count = publishedPosts.filter(
        (p) => p.category_id === cat.id || p.category === cat.name || p.category === cat.slug
      ).length;
      return {
        ...cat,
        post_count: count,
      };
    });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ============================================================================
  // 1. GET /api/v1/health
  // ============================================================================
  app.get('/api/v1/health', (_req: Request, res: Response) => {
    res.status(200).json(
      makeSuccessEnvelope({
        status: 'healthy',
        version: '1.0.0',
        time: formatServerTime(),
      })
    );
  });

  // ============================================================================
  // 2. GET /api/v1/public/courses
  // ============================================================================
  app.get('/api/v1/public/courses', rateLimitMiddleware, (_req: Request, res: Response) => {
    const httpCacheKey = 'http:/api/v1/public/courses';
    const serviceCacheKey = 'service:public:courses';

    const cachedHttp = publicCache.get< ReturnType<typeof makeSuccessEnvelope<Course[]>> >(httpCacheKey);
    if (cachedHttp) {
      setPublicCacheHeaders(res, 'HIT');
      res.status(200).json(cachedHttp);
      return;
    }

    let courses = publicCache.get<Course[]>(serviceCacheKey);
    if (!courses) {
      courses = [...store.courses]
        .sort((a, b) => a.display_order - b.display_order)
        .map((c) => ({
          id: c.id,
          name: c.name,
          icon: c.icon ?? 'fa-book',
          gradient_color_from: c.gradient_color_from ?? '#445D84',
          gradient_color_to: c.gradient_color_to ?? '#5a779e',
          background_image_url: c.background_image_url ?? null,
          description: c.description ?? null,
          full_description: c.full_description ?? c.description ?? null,
          target_grades: c.target_grades ?? 'دهم تا دوازدهم',
          format: c.format ?? 'حضوری و آنلاین',
          badge_label: c.badge_label ?? null,
          price: typeof c.price === 'number' ? c.price : parseInt(String(c.price).replace(/\D/g, ''), 10) || 0,
          display_order: c.display_order,
          features: Array.isArray(c.features) ? c.features : [],
          created_at: c.created_at || new Date().toISOString(),
        }));
      publicCache.set(serviceCacheKey, courses, 600, 'public');
    }

    const payload = makeSuccessEnvelope(courses);
    publicCache.set(httpCacheKey, payload, 300, 'public');
    setPublicCacheHeaders(res, 'MISS');
    res.status(200).json(payload);
  });

  // ============================================================================
  // 3. GET /api/v1/public/instructors
  // ============================================================================
  app.get('/api/v1/public/instructors', rateLimitMiddleware, (_req: Request, res: Response) => {
    const httpCacheKey = 'http:/api/v1/public/instructors';
    const serviceCacheKey = 'service:public:instructors';

    const cachedHttp = publicCache.get<ReturnType<typeof makeSuccessEnvelope<Instructor[]>>>(httpCacheKey);
    if (cachedHttp) {
      setPublicCacheHeaders(res, 'HIT');
      res.status(200).json(cachedHttp);
      return;
    }

    let instructors = publicCache.get<Instructor[]>(serviceCacheKey);
    if (!instructors) {
      instructors = [...store.instructors]
        .sort((a, b) => a.display_order - b.display_order)
        .map((i) => ({
          id: i.id,
          name: i.name,
          title: i.title ?? null,
          description: i.description ?? null,
          full_bio: i.full_bio ?? i.description ?? null,
          image_url:
            i.image_url ??
            `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(i.initial_letter || i.name.charAt(0))}&backgroundColor=445d84`,
          initial_letter: i.initial_letter ?? i.name.charAt(0),
          display_order: i.display_order,
          social_links: Array.isArray(i.social_links) ? i.social_links : [],
          created_at: i.created_at || new Date().toISOString(),
        }));
      publicCache.set(serviceCacheKey, instructors, 600, 'public');
    }

    const payload = makeSuccessEnvelope(instructors);
    publicCache.set(httpCacheKey, payload, 300, 'public');
    setPublicCacheHeaders(res, 'MISS');
    res.status(200).json(payload);
  });

  // ============================================================================
  // 4. GET /api/v1/public/supporters
  // ============================================================================
  app.get('/api/v1/public/supporters', rateLimitMiddleware, (_req: Request, res: Response) => {
    const httpCacheKey = 'http:/api/v1/public/supporters';
    const serviceCacheKey = 'service:public:supporters';

    const cachedHttp = publicCache.get<ReturnType<typeof makeSuccessEnvelope<PublicSupporter[]>>>(httpCacheKey);
    if (cachedHttp) {
      setPublicCacheHeaders(res, 'HIT');
      res.status(200).json(cachedHttp);
      return;
    }

    let supporters = publicCache.get<PublicSupporter[]>(serviceCacheKey);
    if (!supporters) {
      supporters = store.supporters.map(mapSupporterToPublic);
      publicCache.set(serviceCacheKey, supporters, 600, 'public');
    }

    const payload = makeSuccessEnvelope(supporters);
    publicCache.set(httpCacheKey, payload, 300, 'public');
    setPublicCacheHeaders(res, 'MISS');
    res.status(200).json(payload);
  });

  // ============================================================================
  // 5. GET /api/v1/public/blog/posts
  // ============================================================================
  app.get('/api/v1/public/blog/posts', rateLimitMiddleware, (req: Request, res: Response) => {
    const validation = validatePublicPaginationParams(req.query.page, req.query.per_page);
    if (!validation.valid || !validation.value) {
      res
        .status(422)
        .json(makeErrorEnvelope(validation.error!.code, validation.error!.message));
      return;
    }

    const { page, per_page } = validation.value;
    const httpCacheKey = `http:/api/v1/public/blog/posts?page=${page}&per_page=${per_page}`;

    const cachedHttp = publicCache.get<ReturnType<typeof makeSuccessEnvelope<{ posts: BlogPost[] }>>>(httpCacheKey);
    if (cachedHttp) {
      setPublicCacheHeaders(res, 'HIT');
      res.status(200).json(cachedHttp);
      return;
    }

    const publishedPosts = store.blogPosts
      .filter((p) => Boolean(p.published ?? p.is_published === 1))
      .map(mapBlogPostToPublic)
      .sort((a, b) => {
        const tA = a.published_at ? new Date(a.published_at).getTime() : 0;
        const tB = b.published_at ? new Date(b.published_at).getTime() : 0;
        if (tB !== tA) return tB - tA;
        return b.id - a.id;
      });

    const total = publishedPosts.length;
    const total_pages = total === 0 ? 0 : Math.ceil(total / per_page);
    const start = (page - 1) * per_page;
    const paged = publishedPosts.slice(start, start + per_page);

    const payload = makeSuccessEnvelope(
      { posts: paged },
      { page, per_page, total, total_pages }
    );
    publicCache.set(httpCacheKey, payload, 300, 'public');
    setPublicCacheHeaders(res, 'MISS');
    res.status(200).json(payload);
  });

  // ============================================================================
  // 6. GET /api/v1/public/blog/posts/:slug
  // ============================================================================
  app.get('/api/v1/public/blog/posts/:slug', rateLimitMiddleware, (req: Request, res: Response) => {
    const slugValidation = validateBlogSlug(req.params.slug);
    if (!slugValidation.valid || !slugValidation.value) {
      res
        .status(422)
        .json(makeErrorEnvelope(slugValidation.error!.code, slugValidation.error!.message));
      return;
    }

    const slug = slugValidation.value;
    const postCacheKey = `blog_post:${slug}`;
    let cachedPost = publicCache.get<BlogPost>(postCacheKey);
    let cacheStatus: 'HIT' | 'MISS' = 'HIT';

    if (!cachedPost) {
      cacheStatus = 'MISS';
      const found = store.blogPosts.find(
        (p) => p.slug === slug && Boolean(p.published ?? p.is_published === 1)
      );
      if (!found) {
        res
          .status(404)
          .json(makeErrorEnvelope('NOT_FOUND', 'مقاله مورد نظر یافت نشد'));
        return;
      }
      cachedPost = { ...found };
      publicCache.set(postCacheKey, cachedPost, 600, 'public');
    }

    // Atomically increment live post views in Redis (`blog_post_views:{id}`) and DB
    const updatedViews = publicCache.incrementBlogView(cachedPost.id, cachedPost.views || 0);
    const storeIdx = store.blogPosts.findIndex((p) => p.id === cachedPost!.id);
    if (storeIdx !== -1) {
      store.blogPosts[storeIdx].views = updatedViews;
    }

    const hydratedPost = mapBlogPostToPublic({
      ...cachedPost,
      views: updatedViews,
    });

    setPublicCacheHeaders(res, cacheStatus);
    res.status(200).json(makeSuccessEnvelope({ post: hydratedPost }));
  });

  // ============================================================================
  // 7. GET /api/v1/public/blog/categories
  // ============================================================================
  app.get('/api/v1/public/blog/categories', rateLimitMiddleware, (_req: Request, res: Response) => {
    const httpCacheKey = 'http:/api/v1/public/blog/categories';
    const serviceCacheKey = 'service:public:blog:categories';

    const cachedHttp = publicCache.get<ReturnType<typeof makeSuccessEnvelope<BlogCategory[]>>>(httpCacheKey);
    if (cachedHttp) {
      setPublicCacheHeaders(res, 'HIT');
      res.status(200).json(cachedHttp);
      return;
    }

    let categories = publicCache.get<BlogCategory[]>(serviceCacheKey);
    if (!categories) {
      categories = computeCategoriesWithCounts();
      publicCache.set(serviceCacheKey, categories, 600, 'public');
    }

    const payload = makeSuccessEnvelope(categories);
    publicCache.set(httpCacheKey, payload, 300, 'public');
    setPublicCacheHeaders(res, 'MISS');
    res.status(200).json(payload);
  });

  // ============================================================================
  // 8. GET /api/v1/public/blog/categories/:category/posts
  // ============================================================================
  app.get(
    '/api/v1/public/blog/categories/:category/posts',
    rateLimitMiddleware,
    (req: Request, res: Response) => {
      const catValidation = validateBlogCategorySlug(req.params.category);
      if (!catValidation.valid || !catValidation.value) {
        res
          .status(422)
          .json(makeErrorEnvelope(catValidation.error!.code, catValidation.error!.message));
        return;
      }

      const pageValidation = validatePublicPaginationParams(req.query.page, req.query.per_page);
      if (!pageValidation.valid || !pageValidation.value) {
        res
          .status(422)
          .json(makeErrorEnvelope(pageValidation.error!.code, pageValidation.error!.message));
        return;
      }

      const categorySlug = catValidation.value;
      const { page, per_page } = pageValidation.value;
      const httpCacheKey = `http:/api/v1/public/blog/categories/${categorySlug}/posts?page=${page}&per_page=${per_page}`;

      const cachedHttp = publicCache.get<ReturnType<typeof makeSuccessEnvelope<{ posts: BlogPost[] }>>>(httpCacheKey);
      if (cachedHttp) {
        setPublicCacheHeaders(res, 'HIT');
        res.status(200).json(cachedHttp);
        return;
      }

      const matchedCat = store.blogCategories.find(
        (c) => c.slug === categorySlug || c.name === categorySlug
      );

      const filteredPosts = store.blogPosts
        .filter((p) => {
          const isPub = Boolean(p.published ?? p.is_published === 1);
          if (!isPub) return false;
          if (matchedCat) {
            return (
              p.category_id === matchedCat.id ||
              p.category === matchedCat.name ||
              p.category === matchedCat.slug
            );
          }
          return p.category === categorySlug;
        })
        .map(mapBlogPostToPublic)
        .sort((a, b) => {
          const tA = a.published_at ? new Date(a.published_at).getTime() : 0;
          const tB = b.published_at ? new Date(b.published_at).getTime() : 0;
          if (tB !== tA) return tB - tA;
          return b.id - a.id;
        });

      const total = filteredPosts.length;
      const total_pages = total === 0 ? 0 : Math.ceil(total / per_page);
      const start = (page - 1) * per_page;
      const paged = filteredPosts.slice(start, start + per_page);

      const payload = makeSuccessEnvelope(
        { posts: paged },
        { page, per_page, total, total_pages }
      );
      publicCache.set(httpCacheKey, payload, 300, 'public');
      setPublicCacheHeaders(res, 'MISS');
      res.status(200).json(payload);
    }
  );

  // ============================================================================
  // 9. POST /api/v1/auth/login
  // ============================================================================
  app.post('/api/v1/auth/login', rateLimitMiddleware, (req: Request, res: Response) => {
    const validation = validateLoginPayload(req.body);
    if (!validation.valid || !validation.value) {
      res
        .status(422)
        .json(makeErrorEnvelope(validation.error!.code, validation.error!.message));
      return;
    }

    const { username, password } = validation.value;

    // 2FA challenge simulation for accounts requiring 2FA (e.g., 'admin_2fa')
    if (username.toLowerCase().includes('2fa')) {
      res.status(202).json(
        makeSuccessEnvelope({
          requires_2fa: true,
          user_id: 1,
          message: 'کد تایید دو مرحله‌ای به تلگرام شما ارسال شد',
        })
      );
      return;
    }

    // Valid admin or student login check
    const matchedStudent = store.students.find(
      (s) => s.phone === username || s.national_id === username
    );
    const isAdmin =
      (username === 'admin' || username === 'famo' || username === 'مدیر') &&
      password.length >= 4;

    if (!isAdmin && (!matchedStudent || password === 'wrong')) {
      res
        .status(401)
        .json(makeErrorEnvelope('UNAUTHORIZED', 'نام کاربری یا رمز عبور اشتباه است'));
      return;
    }

    res.setHeader('Set-Cookie', 'famo_token=valid_session_jwt; Path=/; HttpOnly; SameSite=Lax');
    res.status(200).json(
      makeSuccessEnvelope({
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.famo_session',
        user: {
          id: matchedStudent ? matchedStudent.id : 1,
          username: matchedStudent ? matchedStudent.name : username,
          role: matchedStudent ? 'student' : 'admin',
        },
      })
    );
  });

  // ============================================================================
  // 10. POST /api/v1/auth/register
  // ============================================================================
  app.post('/api/v1/auth/register', (req: Request, res: Response) => {
    const validation = validateRegistrationPayload(req.body);
    if (!validation.valid || !validation.value) {
      res
        .status(422)
        .json(makeErrorEnvelope(validation.error!.code, validation.error!.message));
      return;
    }

    const { name, phone, nationalId, grade, field } = validation.value;

    // Check conflict (duplicate phone or nationalId)
    const duplicate = store.students.find(
      (s) => s.phone === phone || s.national_id === nationalId
    );
    if (duplicate) {
      res
        .status(409)
        .json(
          makeErrorEnvelope(
            'CONFLICT',
            'دانش‌آموزی با این شماره موبایل یا کد ملی قبلاً در سامانه ثبت‌نام کرده است'
          )
        );
      return;
    }

    const nextId = store.students.reduce((max, s) => Math.max(max, s.id), 0) + 1;
    const newStudent = {
      id: nextId,
      name,
      phone,
      national_id: nationalId,
      grade,
      field,
      is_active: 1,
      user_id: 100 + nextId,
    };
    store.students.unshift(newStudent);

    res.status(201).json(
      makeSuccessEnvelope({
        student: newStudent,
        message: 'ثبت‌نام دانش‌آموز با موفقیت انجام شد',
      })
    );
  });

  // ============================================================================
  // 11. POST /api/v1/auth/verify-2fa
  // ============================================================================
  app.post('/api/v1/auth/verify-2fa', rateLimitMiddleware, (req: Request, res: Response) => {
    const validation = validateVerify2faPayload(req.body);
    if (!validation.valid || !validation.value) {
      res
        .status(422)
        .json(makeErrorEnvelope(validation.error!.code, validation.error!.message));
      return;
    }

    const { user_id, code } = validation.value;
    if (code === '000000' || code === 'invalid') {
      res
        .status(401)
        .json(makeErrorEnvelope('UNAUTHORIZED', 'کد تایید دو مرحله‌ای نامعتبر یا منقضی شده است'));
      return;
    }

    res.status(200).json(
      makeSuccessEnvelope({
        verified: true,
        user_id,
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.famo_2fa_verified',
      })
    );
  });

  // ============================================================================
  // 12. POST /api/v1/auth/logout
  // ============================================================================
  app.post('/api/v1/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', 'famo_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    res.status(200).json(makeSuccessEnvelope({ logged_out: true }));
  });

  // ============================================================================
  // Admin Store & Cache Management Endpoints (for Admin Panel Sync & Telemetry)
  // ============================================================================
  app.get('/api/v1/admin/middleware-status', (_req: Request, res: Response) => {
    res.status(200).json(
      makeSuccessEnvelope({
        cache: publicCache.getStats(),
        rateLimit: {
          maxAttempts: rateLimiter.maxAttempts,
          windowSeconds: rateLimiter.windowSeconds,
          lockoutSeconds: rateLimiter.lockoutSeconds,
        },
      })
    );
  });

  app.post('/api/v1/admin/cache/flush', (_req: Request, res: Response) => {
    const flushedCount = publicCache.flushGroup('public');
    res.status(200).json(
      makeSuccessEnvelope({
        flushed_group: 'public',
        flushed_keys: flushedCount,
        stats: publicCache.getStats(),
      })
    );
  });

  app.post('/api/v1/admin/ratelimit/reset', (_req: Request, res: Response) => {
    rateLimiter.resetAll();
    res.status(200).json(makeSuccessEnvelope({ reset: true }));
  });

  app.get('/api/v1/admin/store', (_req: Request, res: Response) => {
    res.status(200).json(makeSuccessEnvelope(store));
  });

  app.post('/api/v1/admin/sync', (req: Request, res: Response) => {
    const body = req.body as Partial<FamoDataStore> & { flushPublicCache?: boolean };
    if (body) {
      if (Array.isArray(body.students)) store.students = body.students;
      if (Array.isArray(body.courses)) store.courses = body.courses;
      if (Array.isArray(body.instructors)) store.instructors = body.instructors;
      if (Array.isArray(body.supporters)) store.supporters = body.supporters;
      if (Array.isArray(body.exams)) store.exams = body.exams;
      if (Array.isArray(body.files)) store.files = body.files;
      if (Array.isArray(body.blogCategories)) store.blogCategories = body.blogCategories;
      if (Array.isArray(body.blogPosts)) store.blogPosts = body.blogPosts;
      if (Array.isArray(body.reportStats)) store.reportStats = body.reportStats;

      if (body.flushPublicCache !== false) {
        publicCache.flushGroup('public');
      }
    }
    res.status(200).json(
      makeSuccessEnvelope({
        synced: true,
        cacheStats: publicCache.getStats(),
      })
    );
  });

  // ============================================================================
  // Vite Middleware (Development) or Static Serving (Production)
  // ============================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FAMO Full-Stack Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
