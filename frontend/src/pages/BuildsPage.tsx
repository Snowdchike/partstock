import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, AppError } from '../lib/api';

type BomListItem = { id: string; name: string; version: string; lineCount: number };
type BomList = { items: BomListItem[] };

type Pick = {
  id: string;
  partId: string;
  quantityRequested: number;
  quantityPicked: number;
  part: { id: string; name: string; partNumber: string; manufacturer: string | null; unit: string };
  lot: { id: string; code: string } | null;
  location: { id: string; name: string };
};

type Stage = { id: string; name: string; status: string; sequence: number; picks: Pick[] };

type BuildDetail = {
  id: string;
  name: string;
  quantity: number;
  status: string;
  attritionPercent: number;
  notes: string | null;
  completedAt: string | null;
  bom: { id: string; name: string; version: string };
  stages: Stage[];
};

type BuildListItem = {
  id: string;
  name: string;
  quantity: number;
  status: string;
  attritionPercent: number;
  pickCount: number;
  bom: { id: string; name: string; version: string };
};

type BuildList = { items: BuildListItem[]; total: number };

type CreateResp = {
  build: BuildDetail;
  shortages: Array<{ partId: string; needed: number; allocated: number; short: number }>;
  reserved: boolean;
};

export function BuildsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [lastShortages, setLastShortages] = useState<CreateResp['shortages']>([]);

  const list = useQuery({
    queryKey: ['builds'],
    queryFn: () => apiGet<BuildList>('/api/builds', { limit: 200 }),
  });

  const detail = useQuery({
    queryKey: ['build', selectedId],
    enabled: !!selectedId,
    queryFn: () => apiGet<BuildDetail>(`/api/builds/${selectedId}`),
  });

  const boms = useQuery({
    queryKey: ['boms', 'for-build'],
    queryFn: () => apiGet<BomList>('/api/boms', { limit: 200 }),
  });

  const create = useMutation({
    mutationFn: (input: {
      bomId: string;
      name: string;
      quantity: number;
      attritionPercent: number;
      notes?: string;
    }) => apiPost<CreateResp>('/api/builds', { ...input, reserve: true }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['builds'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      setShowCreate(false);
      setSelectedId(res.build.id);
      setLastShortages(res.shortages);
    },
  });

  const start = useMutation({
    mutationFn: (id: string) => apiPost<BuildDetail>(`/api/builds/${id}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['build', selectedId] });
      qc.invalidateQueries({ queryKey: ['builds'] });
    },
  });

  const complete = useMutation({
    mutationFn: (id: string) => apiPost<BuildDetail>(`/api/builds/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['build', selectedId] });
      qc.invalidateQueries({ queryKey: ['builds'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiPost<BuildDetail>(`/api/builds/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['build', selectedId] });
      qc.invalidateQueries({ queryKey: ['builds'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/builds/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['builds'] });
      setSelectedId(null);
    },
  });

  if (list.isLoading) return <div>{t('common.loading')}</div>;
  if (list.error) return <div className="text-red-400">{t('common.error')}</div>;

  const items = list.data?.items ?? [];
  const build = detail.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold flex-1">{t('builds.title')}</h1>
        <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
          + {t('builds.new')}
        </button>
      </div>

      {lastShortages.length > 0 && (
        <div className="card border border-amber-500/40 bg-amber-500/5 text-sm text-amber-200">
          {t('builds.shortageNotice', { count: lastShortages.length })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-2">
          {items.length === 0 ? (
            <div className="card text-center text-zinc-500">{t('builds.empty')}</div>
          ) : (
            items.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSelectedId(b.id);
                  setLastShortages([]);
                }}
                className={`w-full text-left card py-3 px-4 transition ${
                  selectedId === b.id ? 'ring-1 ring-accent/50 bg-accent/5' : 'hover:bg-surface'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium flex-1">{b.name}</span>
                  <StatusBadge status={b.status} />
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  {b.bom.name} · ×{b.quantity} · {b.pickCount} {t('builds.picks')}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {!selectedId ? (
            <div className="card text-center text-zinc-500">{t('builds.pick')}</div>
          ) : detail.isLoading ? (
            <div>{t('common.loading')}</div>
          ) : !build ? (
            <div className="text-red-400">{t('common.error')}</div>
          ) : (
            <div className="space-y-4">
              <div className="card space-y-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[12rem]">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{build.name}</h2>
                      <StatusBadge status={build.status} />
                    </div>
                    <p className="text-sm text-zinc-400">
                      {build.bom.name} v{build.bom.version} · ×{build.quantity} ·{' '}
                      {t('builds.attrition')}: {build.attritionPercent}%
                    </p>
                  </div>
                  {build.status === 'planned' && (
                    <button
                      type="button"
                      className="btn-primary text-xs"
                      disabled={start.isPending}
                      onClick={() => start.mutate(build.id)}
                    >
                      {t('builds.start')}
                    </button>
                  )}
                  {(build.status === 'planned' || build.status === 'in_progress') && (
                    <>
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        disabled={complete.isPending}
                        onClick={() => {
                          if (confirm(t('builds.confirmComplete'))) complete.mutate(build.id);
                        }}
                      >
                        {t('builds.complete')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs text-red-300"
                        disabled={cancel.isPending}
                        onClick={() => {
                          if (confirm(t('builds.confirmCancel'))) cancel.mutate(build.id);
                        }}
                      >
                        {t('builds.cancel')}
                      </button>
                    </>
                  )}
                  {(build.status === 'done' || build.status === 'cancelled') && (
                    <button
                      type="button"
                      className="text-red-400 hover:text-red-300 text-xs"
                      onClick={() => {
                        if (confirm(t('builds.confirmDelete'))) del.mutate(build.id);
                      }}
                    >
                      {t('builds.delete')}
                    </button>
                  )}
                </div>
                {(start.error || complete.error || cancel.error || del.error) && (
                  <div className="text-red-400 text-sm">
                    {(start.error || complete.error || cancel.error || del.error) instanceof AppError
                      ? ((start.error || complete.error || cancel.error || del.error) as AppError).message
                      : t('common.error')}
                  </div>
                )}
              </div>

              {build.stages.map((stage) => (
                <div key={stage.id} className="space-y-2">
                  <h3 className="text-sm font-medium text-zinc-300">
                    {stage.name} · <StatusBadge status={stage.status} />
                  </h3>
                  {stage.picks.length === 0 ? (
                    <div className="card text-center text-zinc-500">{t('builds.noPicks')}</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('parts.fields.name')}</th>
                            <th>{t('parts.fields.partNumber')}</th>
                            <th>{t('stock.location')}</th>
                            <th>{t('stock.lot')}</th>
                            <th className="text-right">{t('builds.requested')}</th>
                            <th className="text-right">{t('builds.picked')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stage.picks.map((p) => (
                            <tr key={p.id}>
                              <td className="font-medium">{p.part.name}</td>
                              <td className="font-mono text-xs">{p.part.partNumber}</td>
                              <td>{p.location.name}</td>
                              <td className="font-mono text-xs">{p.lot?.code ?? '—'}</td>
                              <td className="text-right">{fmt(p.quantityRequested)}</td>
                              <td className="text-right">{fmt(p.quantityPicked)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <CreateBuildModal
          boms={boms.data?.items ?? []}
          busy={create.isPending}
          error={create.error instanceof AppError ? create.error.message : null}
          onClose={() => setShowCreate(false)}
          onSubmit={(data) => create.mutate(data)}
        />
      )}
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    planned: 'bg-zinc-700 text-zinc-200',
    in_progress: 'bg-sky-900/60 text-sky-200',
    done: 'bg-emerald-900/60 text-emerald-200',
    cancelled: 'bg-red-900/40 text-red-200',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${colors[status] ?? 'bg-zinc-700'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function CreateBuildModal({
  boms,
  onSubmit,
  onClose,
  busy,
  error,
}: {
  boms: BomListItem[];
  onSubmit: (data: {
    bomId: string;
    name: string;
    quantity: number;
    attritionPercent: number;
    notes?: string;
  }) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const [bomId, setBomId] = useState(boms[0]?.id ?? '');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [attrition, setAttrition] = useState('2');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-20">
      <div className="card w-full max-w-lg space-y-3">
        <h2 className="font-semibold">{t('builds.new')}</h2>
        <div>
          <label className="label">{t('builds.fields.bom')} *</label>
          <select className="input" value={bomId} onChange={(e) => setBomId(e.target.value)}>
            {boms.length === 0 && <option value="">{t('builds.noBoms')}</option>}
            {boms.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} v{b.version} ({b.lineCount})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('builds.fields.name')} *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('builds.fields.quantity')} *</label>
            <input
              className="input"
              type="number"
              min={0.000001}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="label">{t('builds.attrition')} %</label>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step="any"
              value={attrition}
              onChange={(e) => setAttrition(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">{t('builds.fields.notes')}</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <p className="text-xs text-zinc-500">{t('builds.createHint')}</p>
        {error && <div className="text-red-400 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !bomId || !name.trim() || !(Number(quantity) > 0)}
            onClick={() =>
              onSubmit({
                bomId,
                name: name.trim(),
                quantity: Number(quantity),
                attritionPercent: Number(attrition) || 0,
                notes: notes.trim() || undefined,
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
