'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { integrationsApi, GoogleStatus } from '@/lib/api/settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

function SettingsContent() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const res = await integrationsApi.getGoogleStatus();
      if (res.success) setStatus(res.data);
    } catch {
      toast.error('Failed to load integration status.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();

    const googleParam = searchParams.get('google');
    if (googleParam === 'connected') {
      toast.success('Google account connected successfully.');
      router.replace('/dashboard/settings');
    } else if (googleParam === 'failed') {
      toast.error('Failed to connect Google account. Please try again.');
      router.replace('/dashboard/settings');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    setIsActionLoading(true);
    try {
      const res = await integrationsApi.connectGoogle();
      if (res.success) window.location.href = res.data.auth_url;
    } catch {
      toast.error('Failed to initiate Google connection.');
      setIsActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your Google account? You will no longer be able to export to Sheets.')) return;
    setIsActionLoading(true);
    try {
      await integrationsApi.disconnectGoogle();
      toast.success('Google account disconnected.');
      setStatus({ connected: false, email: null });
    } catch {
      toast.error('Failed to disconnect. Please try again.');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-heading font-bold text-foreground">Settings</h1>

      <Card className="border-border bg-surface/50 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="text-base">Connected Apps</CardTitle>
          <CardDescription>Manage third-party integrations for exporting data.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center space-x-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border border-border p-4 rounded-lg bg-card/40 gap-4">
              <div className="flex items-start space-x-4">
                <div className="bg-primary/10 p-2.5 rounded-md text-primary shrink-0">
                  <ExternalLink className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Google Sheets</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Export extracted candidate data directly to a Google Spreadsheet.
                  </p>
                  {status?.connected && (
                    <div className="flex items-center gap-1.5 mt-2 text-green-500">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">{status.email}</span>
                    </div>
                  )}
                </div>
              </div>

              {status?.connected ? (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isActionLoading}
                  onClick={handleDisconnect}
                  className="shrink-0"
                >
                  {isActionLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  disabled={isActionLoading}
                  onClick={handleConnect}
                  className="shrink-0"
                >
                  {isActionLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  Connect Account
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen" />}>
      <SettingsContent />
    </Suspense>
  );
}