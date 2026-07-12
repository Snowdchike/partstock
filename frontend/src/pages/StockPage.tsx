import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, AppError } from '../lib/api';

type StockRow = {
  partId: string;
  part: { id: string; name: string; partNumber: string; unit: string };
  total: number;
  reserved: number;
  lots: Array<{
    lotId: string | null;
    lotCode: string | null;
    locationId: string;
    locationName: string;
    quantity: number;
  }>;
};

type Part = { id: string; name: string; partNumber: string };
type Location = { id: string; name: string };
type Lot = { id: string; code: string; partId: string };
type PartList = { items: Part[] };

export function StockPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [lowOnly, setLowOnly] = useState(false);
  const [threshold, setThreshold] = useState(10);
  const [showForm, setShowForm] = useState(false);

  const stock = useQuery({
    queryKey: ['stock', lowOnly, threshold],
    queryFn: () =>
      apiGet<StockRow[]>('/api/stock', {
        lowOnly: lowOnly ? '1' : undefined,
        threshold: lowOnly ? threshold : undefined,
      }),
  });

  const adjust = useMutation({
    mutationFn: (input: {
      partId: string;
      locationId: string;
      lotId?: string;
      delta: number;
      reason: string;
    }) => apiPost('/api/stock/adjust', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock'] });
      setShowForm(false);
    },
  });

  const rows = stock.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-semibold flex-1">{t('stock.title')}</h1>
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          {t('stock.lowOnly')}
        </label>
        {lowOnly && (
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
        )}
        <button type="button" className="btn-primary" onClick={() => setShowForm(true)}>
          + {t('stock.adjust')}
        </button>
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
                <th className="text-right">{t('stock.reserved')}</th>
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
                  <td className="text-right font-semibold">
                    {r.total} {r.part.unit}
                  </td>
                  <td className="text-right text-zinc-400 text-sm">{r.reserved}</td>
                  <td>
                    <div className="space-y-0.5">
                      {r.lots.map((l, i) => (
                        <div key={`${l.locationId}-${l.lotId ?? 'none'}-${i}`} className="text-xs">
                          <span className="text-zinc-400">{l.locationName}</span>
                          {l.lotCode && <span className="ml-2 text-zinc-500">[{l.lotCode}]</span>}
                          <span className="ml-2 font-mono"> {l.quantity}</span>
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

      {showForm && (
        <AdjustForm
          busy={adjust.isPending}
          error={adjust.error instanceof AppError ? adjust.error.message : null}
          onClose={() => setShowForm(false)}
          onSubmit={(data) => adjust.mutate(data)}
        />
      )}
    </div>
  );
}

function AdjustForm({
  onSubmit,
  onClose,
  busy,
  error,
}: {
  onSubmit: (d: {
    partId: string;
    locationId: string;
    lotId?: string;
    delta: number;
    reason: string;
  }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [partId, setPartId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [lotId, setLotId] = useState('');
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');

  const parts = useQuery({
    queryKey: ['parts', 'stock-form'],
    queryFn: () => apiGet<PartList>('/api/parts', { limit: 200 }),
  });
  const locations = useQuery({
    queryKey: ['locations'],
    queryFn: () => apiGet<Location[]>('/api/locations'),
  });
  const lots = useQuery({
    queryKey: ['lots', partId || parts.data?.items?.[0]?.id],
    enabled: !!(partId || parts.data?.items?.[0]?.id),
    queryFn: () =>
      apiGet<Lot[]>('/api/lots', { partId: partId || parts.data!.items[0]!.id }),
  });

  const partItems = parts.data?.items ?? [];
  const locItems = locations.data ?? [];
  const effectivePartId = partId || partItems[0]?.id || '';
  const effectiveLocationId = locationId || locItems[0]?.id || '';

  const amount = Number(qty);
  const delta = mode === 'in' ? amount : -amount;
  const canSave =
    !!effectivePartId &&
    !!effectiveLocationId &&
    Number.isFinite(amount) &&
    amount > 0 &&
    reason.trim().length > 0 &&
    !busy;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg space-y-3">
        <h2 className="font-semibold">{t('stock.adjust')}</h2>
        <div>
          <label className="label">{t('stock.fields.part')} *</label>
          <select
            className="input"
            value={effectivePartId}
            onChange={(e) => {
              setPartId(e.target.value);
              setLotId('');
            }}
          >
            {partItems.length === 0 && <option value="">{t('stock.noParts')}</option>}
            {partItems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.partNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('stock.location')} *</label>
          <select
            className="input"
            value={effectiveLocationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locItems.length === 0 && <option value="">{t('stock.noLocations')}</option>}
            {locItems.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('stock.lot')}</label>
          <select className="input" value={lotId} onChange={(e) => setLotId(e.target.value)}>
            <option value="">{t('stock.noLot')}</option>
            {(lots.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('stock.fields.direction')}</label>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value as 'in' | 'out')}>
              <option value="in">{t('stock.in')}</option>
              <option value="out">{t('stock.out')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('stock.quantity')} *</label>
            <input
              className="input"
              type="number"
              min={0.000001}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">{t('stock.fields.reason')} *</label>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('stock.reasonPlaceholder')}
          />
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canSave}
            onClick={() =>
              onSubmit({
                partId: effectivePartId,
                locationId: effectiveLocationId,
                lotId: lotId || undefined,
                delta,
                reason: reason.trim(),
              })
            }
          >
            {busy ? '...' : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
