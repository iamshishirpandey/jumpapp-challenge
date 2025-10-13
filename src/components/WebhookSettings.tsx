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
  const [autoSetupTriggered, setAutoSetupTriggered] = useState(false);

  useEffect(() => {
    if (isConnected) {
      fetchWebhooks(true); // Show loading only on initial fetch
      
      // Set up polling to check for webhooks that might be setting up
      const interval = setInterval(() => {
        fetchWebhooks(); // No loading indicator for polling
      }, 3000); // Check every 3 seconds
      
      // After 15 seconds, if no webhooks exist, trigger auto setup
      const autoSetupTimeout = setTimeout(async () => {
        if (!autoSetupTriggered && webhooks.length === 0) {
          setAutoSetupTriggered(true);
          try {
            await recreateWebhook('gmail');
            await recreateWebhook('calendar');
          } catch (error) {
            console.error('Auto setup failed:', error);
          }
        }
      }, 15000);
      
      // Clear interval after 2 minutes
      const clearIntervalTimeout = setTimeout(() => {
        clearInterval(interval);
      }, 120000);
      
      return () => {
        clearInterval(interval);
        clearTimeout(autoSetupTimeout);
        clearTimeout(clearIntervalTimeout);
      };
    }
  }, [isConnected, webhooks.length, autoSetupTriggered]);

  const fetchWebhooks = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const response = await fetch('/api/webhooks/status');
      const data = await response.json();
      
      if (response.ok) {
        setWebhooks(data.webhooks || []);
      } else {
        throw new Error(data.error || 'Failed to fetch webhooks');
      }
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      if (showLoading) toast.error('Failed to load webhook status');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const recreateWebhook = async (type: 'gmail' | 'calendar') => {
    try {
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
        toast.success(`${type} webhook recreated successfully`);
        await fetchWebhooks(true);
      } else {
        throw new Error(data.error || `Failed to recreate ${type} webhook`);
      }
    } catch (error) {
      console.error(`Error recreating ${type} webhook:`, error);
      toast.error(`Failed to recreate ${type} webhook: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        await fetchWebhooks(true); // Refresh the list
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
      <div className="p-4 border rounded-lg">
        <p className="text-sm text-muted-foreground">
          Webhooks will be automatically set up when you connect your Google account for seamless real-time data updates.
        </p>
      </div>
    );
  }

  const gmailWebhook = webhooks.find(w => w.resourceType === 'gmail');
  const calendarWebhook = webhooks.find(w => w.resourceType === 'calendar');
  const isProduction = process.env.NODE_ENV === 'production';

  return (
    <div className="space-y-4">
        {/* Gmail Webhook */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="flex items-center gap-3">
            {gmailWebhook && getStatusIcon(gmailWebhook)}
            <div>
              <h4 className="font-medium">Gmail Sync</h4>
              <p className="text-sm text-muted-foreground">
                {gmailWebhook ? "Real-time email notifications are active" : "Automatically configured on login"}
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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recreateWebhook('gmail')}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Recreate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteWebhook(gmailWebhook.channelId, 'gmail')}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Setting up...
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recreateWebhook('gmail')}
                  className="ml-2"
                >
                  Setup Now
                </Button>
              </div>
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
                {calendarWebhook 
                  ? "Real-time calendar notifications are active" 
                  : isProduction 
                    ? "Automatically configured on login"
                    : "Available in production only"}
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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => recreateWebhook('calendar')}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Recreate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteWebhook(calendarWebhook.channelId, 'calendar')}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {isProduction ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      Setting up...
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => recreateWebhook('calendar')}
                      className="ml-2"
                    >
                      Setup Now
                    </Button>
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Requires production environment</span>
                  </div>
                )}
              </div>
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
              onClick={() => fetchWebhooks(true)}
              className="w-full"
            >
              Refresh Status
            </Button>
          </div>
        )}
    </div>
  );
}