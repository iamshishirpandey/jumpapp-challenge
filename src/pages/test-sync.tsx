import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function TestSync() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [pgvectorInfo, setPgvectorInfo] = useState<any>(null);

  const forceSync = async (service: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/debug/force-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const data = await response.json();
      setResults(data);
      
      // Also fetch pgvector info
      const pgResponse = await fetch('/api/debug/pgvector');
      const pgData = await pgResponse.json();
      setPgvectorInfo(pgData);
    } catch (error) {
      console.error('Force sync error:', error);
      setResults({ error: error instanceof Error ? error.message : 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  const testSearch = async () => {
    const query = prompt('Enter search query:');
    if (!query) return;
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });
      const data = await response.json();
      alert(`Response: ${data.response}\n\nSources found: ${data.sources?.length || 0}`);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Test Sync & Debug</h1>
      
      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Force Sync Services</h2>
          <div className="flex gap-4">
            <Button onClick={() => forceSync('hubspot')} disabled={loading}>
              Force Sync HubSpot
            </Button>
            <Button onClick={() => forceSync('gmail')} disabled={loading}>
              Force Sync Gmail
            </Button>
            <Button onClick={() => forceSync('calendar')} disabled={loading}>
              Force Sync Calendar
            </Button>
            <Button onClick={() => forceSync('all')} disabled={loading}>
              Force Sync All
            </Button>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Test RAG Search</h2>
          <Button onClick={testSearch}>Test Search Query</Button>
        </div>

        {pgvectorInfo && (
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">PGVector Document Counts</h2>
            <pre className="text-sm bg-gray-100 p-2 rounded">
              {JSON.stringify(pgvectorInfo, null, 2)}
            </pre>
          </div>
        )}

        {results && (
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-4">Sync Results</h2>
            <pre className="text-sm bg-gray-100 p-2 rounded overflow-auto max-h-96">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}