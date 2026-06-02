'use client';

import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import { buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UserCircle, LogOut, Settings} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/auth';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { cn } from '@/lib/utils';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    } finally {
      logout();
      router.push('/');
    }
  };

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background flex flex-col">
        {/* Top Nav */}
        <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
          <div className="flex items-center justify-between px-6 h-16">
            <div className="flex items-center space-x-8">
              <Link href="/dashboard" className="font-heading font-bold text-xl text-primary">
                CV Extractor
              </Link>
              <nav className="hidden md:flex items-center space-x-1">
                <Link href="/dashboard" className="text-sm font-medium px-3 py-2 rounded-md bg-muted text-foreground">
                  Jobs
                </Link>
              </nav>
            </div>
            
            <div className="flex items-center space-x-4">
              <Link href="/jobs/create" className={cn(buttonVariants({ size: "sm" }), "hidden sm:flex")}>
                Create Job
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}>
                  <UserCircle className="h-6 w-6 text-muted-foreground hover:text-foreground transition-colors" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-surface border-border">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground">{user?.fullName || 'User'}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                   <DropdownMenuSeparator className="bg-border" />
                    <Link
                      href="/dashboard/settings"
                      className="flex w-full items-center px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <Settings className="mr-3 h-4 w-4" />
                      Settings
                    </Link>
                    <DropdownMenuSeparator className="bg-border" />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <LogOut className="mr-3 h-4 w-4" />
                      Sign out
                    </button>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
