import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Webhook, Trash2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface WebhookSubscription {
  id: string;
  channelId: string;
  resourceType: string;
  resourceId: string;
  isActive: boolean;
  expiresAt: string | null;
  lastProcessedAt: string | null;
  createdAt: string;
  metadata?: any;
}

interface WebhookSettingsProps {
  isConnected: boolean;
}

export function WebhookSettings({ isConnected }: WebhookSettingsProps) {
  const [webhooks, setWebhooks] = useState<WebhookSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState<{ gmail: boolean; calendar: boolean }>({
    gmail: false,
    calendar: false
  });

  useEffect(() => {
    if (isConnected) {
      fetchWebhooks();
    }
  }, [isConnected]);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/webhooks/status');
      const data = await response.json();
      
      if (response.ok) {
        setWebhooks(data.webhooks || []);
      } else {
        throw new Error(data.error || 'Failed to fetch webhooks');
      }
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      toast.error('Failed to load webhook status');
    } finally {
      setLoading(false);
    }
  };

  const setupWebhook = async (type: 'gmail' | 'calendar') => {
    try {
      setSetupLoading(prev => ({ ...prev, [type]: true }));
      
      const response = await fetch('/api/webhooks/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          type,
          calendarId: type === 'calendar' ? 'primary' : undefined
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        toast.success(`${type} webhook set up successfully`);
        await fetchWebhooks(); // Refresh the list
      } else {
        throw new Error(data.error || `Failed to set up ${type} webhook`);
      }
    } catch (error) {
      console.error(`Error setting up ${type} webhook:`, error);
      toast.error(`Failed to set up ${type} webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSetupLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const deleteWebhook = async (channelId: string, resourceType: string) => {
    if (!confirm(`Are you sure you want to stop the ${resourceType} webhook?`)) {
      return;
    }

    try {
      const response = await fetch('/api/webhooks/status', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ channelId }),
      });

      const data = await response.json();
      
      if (response.ok) {
        toast.success(`${resourceType} webhook stopped successfully`);
        await fetchWebhooks(); // Refresh the list
      } else {
        throw new Error(data.error || 'Failed to stop webhook');
      }
    } catch (error) {
      console.error('Error deleting webhook:', error);
      toast.error(`Failed to stop webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  const getStatusIcon = (webhook: WebhookSubscription) => {
    const isExpired = webhook.expiresAt && new Date(webhook.expiresAt) < new Date();
    
    if (!webhook.isActive || isExpired) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const getStatusBadge = (webhook: WebhookSubscription) => {
    const isExpired = webhook.expiresAt && new Date(webhook.expiresAt) < new Date();
    
    if (!webhook.isActive) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    
    if (isExpired) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    
    return <Badge variant="default">Active</Badge>;
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Real-time Sync (Webhooks)
          </CardTitle>
          <CardDescription>
            Connect your Google account to enable real-time email and calendar synchronization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please connect your Google account first to set up webhooks for real-time data updates.
          </p>
        </CardContent>
      </Card>
    );
  }

  const gmailWebhook = webhooks.find(w => w.resourceType === 'gmail');
  const calendarWebhook = webhooks.find(w => w.resourceType === 'calendar');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Real-time Sync (Webhooks)
        </CardTitle>
        <CardDescription>
          Set up real-time notifications to keep your data synchronized automatically
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Gmail Webhook */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {gmailWebhook && getStatusIcon(gmailWebhook)}
            <div>
              <h4 className="font-medium">Gmail Sync</h4>
              <p className="text-sm text-muted-foreground">
                Get notified when new emails arrive
              </p>
              {gmailWebhook && (
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(gmailWebhook)}
                  <span className="text-xs text-muted-foreground">
                    Last processed: {formatDate(gmailWebhook.lastProcessedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {gmailWebhook ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteWebhook(gmailWebhook.channelId, 'gmail')}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setupWebhook('gmail')}
                disabled={setupLoading.gmail}
                size="sm"
              >
                {setupLoading.gmail && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Set Up
              </Button>
            )}
          </div>
        </div>

        {/* Calendar Webhook */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {calendarWebhook && getStatusIcon(calendarWebhook)}
            <div>
              <h4 className="font-medium">Calendar Sync</h4>
              <p className="text-sm text-muted-foreground">
                Get notified when calendar events change
              </p>
              {calendarWebhook && (
                <div className="flex items-center gap-2 mt-1">
                  {getStatusBadge(calendarWebhook)}
                  <span className="text-xs text-muted-foreground">
                    Last processed: {formatDate(calendarWebhook.lastProcessedAt)}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {calendarWebhook ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteWebhook(calendarWebhook.channelId, 'calendar')}
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => setupWebhook('calendar')}
                disabled={setupLoading.calendar}
                size="sm"
              >
                {setupLoading.calendar && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Set Up
              </Button>
            )}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm text-muted-foreground">Loading webhook status...</span>
          </div>
        )}

        {webhooks.length > 0 && (
          <div className="pt-4 border-t">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchWebhooks}
              className="w-full"
            >
              Refresh Status
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Webhooks enable real-time synchronization of your Gmail and Calendar data</p>
          <p>• Your pgvector database will be updated automatically when new emails arrive or events change</p>
          <p>• Webhooks will automatically renew before they expire</p>
        </div>
      </CardContent>
    </Card>
  );
}