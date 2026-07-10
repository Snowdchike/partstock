import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../lib/api';

type StockRow = {
  partId: string;
  part: { id: string; name: string; partNumber: string; unit: string };
  total: number;
  lots: Array<{
    lotId: string | null;
    lotCode: string | null;
    locationId: string;
    locationName: string;
    quantity: number;
  }>;
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
    <div className="space-y-8">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">{t('stock.title')}</h1>
        <label className="text-xs text-muted flex items-baseline gap-2">
          <span>{t('stock.threshold')}</span>
          <input
            type="number"
            min={0}
            className="input w-20 py-0.5 text-right tabular"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>
      </div>

      {stock.isLoading ? (
        <div className="text-muted">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <p className="text-muted italic font-serif py-8">{t('stock.empty')}</p>
      ) : (
        <table className="table-hairline">
          <thead>
            <tr>
              <th>{t('parts.fields.name')}</th>
              <th>{t('parts.fields.partNumber')}</th>
              <th className="text-right pr-2">{t('stock.total')}</th>
              <th>
                {t('stock.location')} / {t('stock.lot')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partId}>
                <td className="font-medium">{r.part.name}</td>
                <td className="font-mono text-xs">{r.part.partNumber}</td>
                <td className="text-right tabular font-medium pr-2">
                  {r.total} {r.part.unit}
                </td>
                <td>
                  <div className="space-y-0.5">
                    {r.lots.map((l, i) => (
                      <div key={`${l.locationId}-${l.lotId ?? 'none'}-${i}`} className="text-xs">
                        <span className="text-muted">{l.locationName}</span>
                        {l.lotCode && <span className="ml-2 text-muted/70">[{l.lotCode}]</span>}
                        <span className="ml-2 font-mono tabular">{l.quantity}</span>
                      </div>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
