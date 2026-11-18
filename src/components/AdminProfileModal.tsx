import React, { useEffect, useState } from 'react';
import { UserCog, KeyRound, Shield, Eye, EyeOff } from 'lucide-react';
import API from '../lib/api';
import type { ToastType } from '../types';
import { Modal } from './Modal';
import { ActionButton, FieldError, getFieldClass } from './FormControls';

interface AdminProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: ToastType) => void;
  onProfileUpdated?: (username: string) => void;
}

export const AdminProfileModal: React.FC<AdminProfileModalProps> = ({
  isOpen,
  onClose,
  showToast,
  onProfileUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile');
  const [loadingMe, setLoadingMe] = useState(false);
  const [submittingProfile, setSubmittingProfile] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    current_password: '',
  });
  const [profileErrors, setProfileErrors] = useState<{
    full_name?: string;
    phone?: string;
    current_password?: string;
  }>({});

  // Password Form State
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordErrors, setPasswordErrors] = useState<{
    current_password?: string;
    new_password?: string;
    confirm_password?: string;
  }>({});
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('profile');
      setProfileErrors({});
      setPasswordErrors({});
      setPasswordForm({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
      setLoadingMe(true);
      API.getMe()
        .then((user) => {
          if (user) {
            setProfileForm({
              full_name: user.full_name || user.username || '',
              phone: (user as any).phone || '',
              current_password: '',
            });
          }
        })
        .catch(() => {
          // ignore
        })
        .finally(() => {
          setLoadingMe(false);
        });
    }
  }, [isOpen]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingProfile) return;

    const errors: { full_name?: string; phone?: string; current_password?: string } = {};
    if (!profileForm.full_name.trim()) {
      errors.full_name = 'نام و نام خانوادگی نمی‌تواند خالی باشد';
    }
    if (!profileForm.phone.trim()) {
      errors.phone = 'شماره موبایل الزامی است';
    }

    setProfileErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('لطفاً خطاهای فرم پروفایل را برطرف کنید', 'error');
      return;
    }

    setSubmittingProfile(true);
    try {
      const res = await API.updateProfile({
        full_name: profileForm.full_name.trim(),
        name: profileForm.full_name.trim(),
        phone: profileForm.phone.trim(),
        current_password: profileForm.current_password.trim() || undefined,
      });

      showToast('پروفایل با موفقیت به‌روزرسانی شد', 'success');
      const updatedName = res.data?.full_name || res.data?.username || profileForm.full_name.trim();
      onProfileUpdated?.(updatedName);
      onClose();
    } catch (err) {
      const errMsg = (err as Error).message || 'خطا در به‌روزرسانی پروفایل';
      if (errMsg.includes('INVALID_PASSWORD') || errMsg.includes('رمز')) {
        setProfileErrors({ current_password: 'رمز عبور فعلی برای تغییر شماره موبایل الزامی است' });
      }
      showToast(errMsg, 'error');
    } finally {
      setSubmittingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingPassword) return;

    const errors: { current_password?: string; new_password?: string; confirm_password?: string } = {};
    if (!passwordForm.current_password) {
      errors.current_password = 'وارد کردن رمز عبور فعلی الزامی است';
    }
    if (!passwordForm.new_password || passwordForm.new_password.length < 4) {
      errors.new_password = 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد';
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      errors.confirm_password = 'تکرار رمز عبور جدید مطابقت ندارد';
    }

    setPasswordErrors(errors);
    if (Object.keys(errors).length > 0) {
      showToast('لطفاً خطاهای فرم تغییر رمز را برطرف کنید', 'error');
      return;
    }

    setSubmittingPassword(true);
    try {
      await API.changePassword({
        current_password: passwordForm.current_password,
        new_password: passwordForm.new_password,
      });

      showToast('رمز عبور با موفقیت تغییر یافت', 'success');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
      onClose();
    } catch (err) {
      const errMsg = (err as Error).message || 'خطا در تغییر رمز عبور';
      if (errMsg.includes('INVALID_PASSWORD') || errMsg.includes('اشتباه')) {
        setPasswordErrors({ current_password: 'رمز عبور فعلی اشتباه است' });
      }
      showToast(errMsg, 'error');
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="پروفایل کاربری و امنیت"
      subtitle="ویرایش مشخصات شخصی و تغییر رمز عبور سامانه"
      icon={<UserCog className="w-5 h-5" />}
      size="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500">
            {activeTab === 'profile' ? 'ویرایش نام و شماره تماس' : 'تغییر رمز عبور ورود به پنل'}
          </div>
          <ActionButton
            type="button"
            variant="secondary"
            onClick={onClose}
            className="px-5 py-2"
          >
            بستن
          </ActionButton>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Tab Selector */}
        <div
          role="tablist"
          className="inline-flex p-1 rounded-xl bg-slate-200/80 border border-slate-300/60 w-full"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-[#445D84] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCog className="w-4 h-4" />
            <span>مشخصات پروفایل</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'password'}
            onClick={() => setActiveTab('password')}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'password'
                ? 'bg-[#445D84] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>تغییر رمز عبور</span>
          </button>
        </div>

        {loadingMe ? (
          <div className="space-y-3 py-6">
            <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
          </div>
        ) : activeTab === 'profile' ? (
          <form noValidate onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                نام و نام خانوادگی <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={profileForm.full_name}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, full_name: e.target.value });
                  if (profileErrors.full_name)
                    setProfileErrors((prev) => ({ ...prev, full_name: undefined }));
                }}
                aria-invalid={Boolean(profileErrors.full_name)}
                className={getFieldClass(Boolean(profileErrors.full_name))}
                placeholder="نام مدیر یا پشتیبان..."
              />
              <FieldError message={profileErrors.full_name} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                شماره موبایل <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                dir="ltr"
                maxLength={14}
                value={profileForm.phone}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, phone: e.target.value });
                  if (profileErrors.phone)
                    setProfileErrors((prev) => ({ ...prev, phone: undefined }));
                }}
                aria-invalid={Boolean(profileErrors.phone)}
                className={getFieldClass(Boolean(profileErrors.phone), 'text-start')}
                placeholder="09123456789"
              />
              <FieldError message={profileErrors.phone} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رمز عبور فعلی (فقط هنگام تغییر شماره موبایل الزامی است)
              </label>
              <input
                type="password"
                dir="ltr"
                value={profileForm.current_password}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, current_password: e.target.value });
                  if (profileErrors.current_password)
                    setProfileErrors((prev) => ({ ...prev, current_password: undefined }));
                }}
                aria-invalid={Boolean(profileErrors.current_password)}
                className={getFieldClass(Boolean(profileErrors.current_password), 'text-start')}
                placeholder="••••••••"
              />
              <FieldError message={profileErrors.current_password} />
            </div>

            <div className="pt-2 flex justify-end">
              <ActionButton
                type="submit"
                loading={submittingProfile}
                loadingText="در حال ذخیره..."
                className="px-6 py-2.5"
              >
                ذخیره تغییرات پروفایل
              </ActionButton>
            </div>
          </form>
        ) : (
          <form noValidate onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رمز عبور فعلی <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={passwordForm.current_password}
                  onChange={(e) => {
                    setPasswordForm({ ...passwordForm, current_password: e.target.value });
                    if (passwordErrors.current_password)
                      setPasswordErrors((prev) => ({ ...prev, current_password: undefined }));
                  }}
                  aria-invalid={Boolean(passwordErrors.current_password)}
                  className={getFieldClass(Boolean(passwordErrors.current_password), 'text-start ps-3.5 pe-10')}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  aria-label="نمایش یا مخفی کردن رمز"
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FieldError message={passwordErrors.current_password} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                رمز عبور جدید <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  dir="ltr"
                  value={passwordForm.new_password}
                  onChange={(e) => {
                    setPasswordForm({ ...passwordForm, new_password: e.target.value });
                    if (passwordErrors.new_password)
                      setPasswordErrors((prev) => ({ ...prev, new_password: undefined }));
                  }}
                  aria-invalid={Boolean(passwordErrors.new_password)}
                  className={getFieldClass(Boolean(passwordErrors.new_password), 'text-start ps-3.5 pe-10')}
                  placeholder="حداقل ۴ کاراکتر"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  aria-label="نمایش یا مخفی کردن رمز جدید"
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FieldError message={passwordErrors.new_password} />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                تکرار رمز عبور جدید <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                dir="ltr"
                value={passwordForm.confirm_password}
                onChange={(e) => {
                  setPasswordForm({ ...passwordForm, confirm_password: e.target.value });
                  if (passwordErrors.confirm_password)
                    setPasswordErrors((prev) => ({ ...prev, confirm_password: undefined }));
                }}
                aria-invalid={Boolean(passwordErrors.confirm_password)}
                className={getFieldClass(Boolean(passwordErrors.confirm_password), 'text-start')}
                placeholder="تکرار رمز عبور جدید"
              />
              <FieldError message={passwordErrors.confirm_password} />
            </div>

            <div className="pt-2 flex justify-end">
              <ActionButton
                type="submit"
                loading={submittingPassword}
                loadingText="در حال تغییر رمز..."
                className="px-6 py-2.5"
              >
                تغییر رمز عبور
              </ActionButton>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
