'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@/lib/validators/jobSchemas';
import { useAuthStore } from '@/lib/stores/authStore';
import { authApi } from '@/lib/api/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { setToken, setUser } = useAuthStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onLogin = async (values: Record<string, unknown>) => {
    setIsLoading(true);
    setGlobalError('');
    try {
      const res = await authApi.login(values);
      if (res.success && res.data?.access_token) {
        setToken(res.data.access_token);
        if (res.data.user) setUser(res.data.user);
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      const error = err as { error?: { message?: string } };
      setGlobalError(error.error?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background glow effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-surface/50 backdrop-blur-xl border border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10"
      >
        <div className="text-center space-y-3 mb-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner hover:scale-105 transition-transform"
          >
            <span className="text-2xl font-bold font-heading text-primary">CV</span>
          </Link>
          <h2 className="text-3xl font-bold font-heading tracking-tight text-foreground">Welcome back</h2>
          <p className="text-sm text-muted-foreground">Sign in to your account to continue</p>
        </div>

        {globalError && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
            {globalError}
          </div>
        )}

        <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              {...loginForm.register('email')}
              className="bg-background/50 border-white/10 focus-visible:ring-primary h-12 backdrop-blur-sm transition-all hover:bg-background/80"
            />
            {loginForm.formState.errors.email && (
              <p className="text-xs text-destructive">
                {loginForm.formState.errors.email.message as string}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                Password
              </Label>
              <Link
                href="/forgot-password"
                className="text-[11px] font-medium text-primary hover:text-primary-hover transition-colors"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              {...loginForm.register('password')}
              className="bg-background/50 border-white/10 focus-visible:ring-primary h-12 backdrop-blur-sm transition-all hover:bg-background/80"
            />
            {loginForm.formState.errors.password && (
              <p className="text-xs text-destructive">
                {loginForm.formState.errors.password.message as string}
              </p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 mt-4 text-md font-medium bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25 hover:-translate-y-0.5 active:translate-y-0 transition-all group"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <span className="flex items-center justify-center">Sign In <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></span>
            )}
          </Button>
        </form>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Don’t have an account?{' '}
          <Link href="/register" className="text-primary hover:text-primary-hover hover:underline font-semibold transition-colors">
            Register here
          </Link>
        </div>
      </motion.div>
    </div>
  );
}