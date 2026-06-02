'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginSchema, registerSchema } from '@/lib/validators/jobSchemas';
import { useAuthStore } from '@/lib/stores/authStore';
import { useUiStore } from '@/lib/stores/uiStore';
import { authApi } from '@/lib/api/auth';
import { Loader2, ArrowRight } from 'lucide-react';
import { JobSetupWizard } from '../wizard/JobSetupWizard';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * AuthModal handles both the login/register forms 
 * and acts as a gateway for the Job Setup Wizard.
 */
export function AuthModal() {
  const { isModalOpen, closeModal, modalMode, setModalMode } = useUiStore();
  const { isAuthenticated, setToken, setUser } = useAuthStore();

  const [activeTab, setActiveTab] = useState('login');
  const [isLoading, setIsLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const onAuthSuccess = () => {
    // If we opened this to start a job, stay open but transition to wizard
    if (modalMode !== 'wizard') {
      closeModal();
    }
  };

  const onLogin = async (values: Record<string, unknown>) => {
    setIsLoading(true);
    setGlobalError('');
    try {
      const res = await authApi.login(values);
      if (res.success && res.data?.access_token) {
        setToken(res.data.access_token);
        if (res.data.user) setUser(res.data.user);
        onAuthSuccess();
      }
    } catch (err: unknown) {
      const error = err as { error?: { message?: string } };
      setGlobalError(error.error?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (values: Record<string, unknown>) => {
    setIsLoading(true);
    setGlobalError('');
    try {
      const res = await authApi.register(values);
      if (res.success && res.data?.access_token) {
        setToken(res.data.access_token);
        if (res.data.user) setUser(res.data.user);
        onAuthSuccess();
      }
    } catch (err: unknown) {
      const error = err as { error?: { message?: string } };
      setGlobalError(error.error?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeModal();
      setTimeout(() => {
        setModalMode('auth');
        loginForm.reset();
        registerForm.reset();
        setGlobalError('');
      }, 300);
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden bg-background/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl gap-0">
        <DialogTitle className="sr-only">Authentication or Job Setup</DialogTitle>
        <DialogDescription className="sr-only">Authenticate to continue or setup your extraction job.</DialogDescription>

        {/* Subtle background glow effect inside the modal */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-1/2 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10">
          {modalMode === 'wizard' && isAuthenticated ? (
            <JobSetupWizard onComplete={closeModal} />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-8 sm:p-10"
            >
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 mb-5 shadow-inner backdrop-blur-sm">
                  <span className="text-2xl font-heading font-bold text-primary">CV</span>
                </div>
                <h2 className="text-3xl font-heading font-bold text-foreground tracking-tight">Sign in to continue</h2>
                <p className="text-muted-foreground mt-2 text-sm max-w-xs mx-auto">Create an account to securely save and export your extracted data.</p>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 bg-surface/50 backdrop-blur-md border border-white/5 p-1 rounded-xl shadow-inner">
                  <TabsTrigger value="login" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-300">Sign In</TabsTrigger>
                  <TabsTrigger value="register" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all duration-300">Register</TabsTrigger>
                </TabsList>

                {globalError && (
                  <div className="mb-6 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center">
                    {globalError}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {activeTab === 'login' && (
                    <motion.form
                      key="login-form"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={loginForm.handleSubmit(onLogin)}
                      className="space-y-5"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Email</Label>
                        <Input id="email" type="email" placeholder="you@company.com" {...loginForm.register('email')} className="bg-surface/50 border-white/10 h-12 focus-visible:ring-primary backdrop-blur-sm transition-all hover:bg-surface/80" />
                        {loginForm.formState.errors.email && <p className="text-xs text-destructive">{loginForm.formState.errors.email.message as string}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Password</Label>
                        <Input id="password" type="password" placeholder="••••••••" {...loginForm.register('password')} className="bg-surface/50 border-white/10 h-12 focus-visible:ring-primary backdrop-blur-sm transition-all hover:bg-surface/80" />
                        {loginForm.formState.errors.password && <p className="text-xs text-destructive">{loginForm.formState.errors.password.message as string}</p>}
                      </div>
                      <Button type="submit" className="w-full h-12 mt-4 text-md font-medium bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all group" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                          <span className="flex items-center justify-center">Sign In <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></span>
                        )}
                      </Button>
                    </motion.form>
                  )}

                  {activeTab === 'register' && (
                    <motion.form
                      key="register-form"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={registerForm.handleSubmit(onRegister)}
                      className="space-y-5"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="fullName" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Name</Label>
                        <Input id="fullName" placeholder="Name or Username" {...registerForm.register('fullName')} className="bg-surface/50 border-white/10 h-12 focus-visible:ring-primary backdrop-blur-sm transition-all hover:bg-surface/80" />
                        {registerForm.formState.errors.fullName && <p className="text-xs text-destructive">{registerForm.formState.errors.fullName.message as string}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-email" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Email</Label>
                        <Input id="reg-email" type="email" placeholder="you@company.com" {...registerForm.register('email')} className="bg-surface/50 border-white/10 h-12 focus-visible:ring-primary backdrop-blur-sm transition-all hover:bg-surface/80" />
                        {registerForm.formState.errors.email && <p className="text-xs text-destructive">{registerForm.formState.errors.email.message as string}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="reg-password" className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Password</Label>
                        <Input id="reg-password" type="password" placeholder="••••••••" {...registerForm.register('password')} className="bg-surface/50 border-white/10 h-12 focus-visible:ring-primary backdrop-blur-sm transition-all hover:bg-surface/80" />
                        {registerForm.formState.errors.password && <p className="text-xs text-destructive">{registerForm.formState.errors.password.message as string}</p>}
                      </div>
                      <Button type="submit" className="w-full h-12 mt-4 text-md font-medium bg-primary hover:bg-primary-hover shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all group" disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (
                          <span className="flex items-center justify-center">Create Account <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" /></span>
                        )}
                      </Button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </Tabs>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
