import { SkeletonBar, LoadingRegion } from './Skeleton';
import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { getProjectTrends, getProjectHealth, errorMessage } from '../services/api';

/**
 * Risk and health over time.
 *
 * getProjectTrends() and getProjectHealth() were exported from the API layer
 * but imported by nothing, so the endpoints returned data no screen displayed.
 * This is the screen.
 */
const HealthTrend = ({ projectId }) => {
  const [series, setSeries] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([getProjectTrends(projectId), getProjectHealth(projectId)])
      .then(([trendsRes, healthRes]) => {
        if (cancelled) return;

        const docs = trendsRes.data.documents || [];
        const history = trendsRes.data.history || [];

        // Prefer the health timeline when it exists — it has a point per
        // analysis run. Fall back to per-document scores otherwise.
        const points = history.length > 0
          ? history.map(h => ({
              label: new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
              health: h.overallScore,
              risk: h.riskScore,
            }))
          : docs.map(d => ({
              label: (d.originalName || '').slice(0, 14),
              health: d.healthScore,
              risk: d.riskScore,
            }));

        setSeries(points);
        setHealth(healthRes.data);
      })
      .catch(err => { if (!cancelled) setError(errorMessage(err, 'Could not load trends.')); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return null;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingUp size={18} color="#059669" /> Health and risk over time
        </h3>
        {health?.score != null && (
          <span style={{ fontSize: 13, color: '#64748b' }}>
            Current health <strong style={{ color: '#0f172a' }}>{health.score}/100</strong>
            {health.grade && <span style={{ marginLeft: 6, color: '#4f46e5', fontWeight: 700 }}>({health.grade})</span>}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ marginTop: 16 }}>
          <LoadingRegion label="Loading the trend"><SkeletonBar width="100%" height={220} style={{ borderRadius: 12 }} /></LoadingRegion>
        </div>
      )}

      {error && (
        <p style={{ margin: '12px 0 0', fontSize: 13, color: '#b91c1c' }}>{error}</p>
      )}

      {!loading && !error && series.length < 2 && (
        <div style={{ padding: '28px 20px', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: 12, marginTop: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
            {series.length === 0
              ? 'No analyses yet. Upload a document to start the timeline.'
              : 'One analysis so far. Run another to see the trend.'}
          </p>
        </div>
      )}

      {!loading && !error && series.length >= 2 && (
        <div style={{ height: 260, marginTop: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
                formatter={(value, name) => [`${value}/100`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="health" name="Health" stroke="#059669" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="risk" name="Risk" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default HealthTrend;
