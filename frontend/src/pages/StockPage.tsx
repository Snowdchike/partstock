import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

type StockRow = {
  partId: string;
  part: { id: string; name: string; partNumber: string; unit: string };
  total: number;
  lots: Array<{ lotId: string | null; lotCode: string | null; locationId: string; locationName: string; quantity: number }>;
};

export function StockPage() {
  const { t } = useTranslation();
  const [threshold, setThreshold] = useState(0);

  const stock = useQuery({
    queryKey: ['stock', threshold],
    queryFn: () => apiGet<StockRow[]>('/api/stock', { threshold }),
  });

  const rows = stock.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">{t('stock.title')}</h1>
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          {t('stock.threshold')}
          <input
            type="number"
            min={0}
            className="input w-20 py-1"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>
      </div>

      {stock.isLoading ? (
        <div>{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <div className="card text-center text-zinc-500">{t('stock.empty')}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('parts.fields.name')}</th>
                <th>{t('parts.fields.partNumber')}</th>
                <th className="text-right">{t('stock.total')}</th>
                <th>{t('stock.location')} / {t('stock.lot')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.partId}>
                  <td className="font-medium">{r.part.name}</td>
                  <td className="font-mono text-xs">{r.part.partNumber}</td>
                  <td className="text-right font-semibold">
                    {r.total} {r.part.unit}
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      {r.lots.map((l, i) => (
                        <div key={`${l.locationId}-${l.lotId ?? 'none'}-${i}`} className="text-xs">
                          <span className="text-zinc-400">{l.locationName}</span>
                          {l.lotCode && <span className="ml-2 text-zinc-500">[{l.lotCode}]</span>}
                          <span className="ml-2 font-mono">{l.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
