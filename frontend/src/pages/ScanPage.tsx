import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { apiGet, AppError } from '../lib/api';

type ScanResult = {
  q: string;
  count: number;
  primary: { type: string; id: string; partId?: string } | null;
  matches: Array<Record<string, unknown>>;
};

export function ScanPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [camSupported, setCamSupported] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimer = useRef<number | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // @ts-expect-error BarcodeDetector is experimental
    setCamSupported(typeof window !== 'undefined' && typeof window.BarcodeDetector !== 'undefined');
    return () => stopCamera();
  }, []);

  const stopCamera = () => {
    if (detectTimer.current) {
      window.clearInterval(detectTimer.current);
      detectTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    setCamOn(false);
  };

  const lookup = async (raw: string, autoNav = true) => {
    const q = raw.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiGet<ScanResult>('/api/scan', { q });
      setResult(res);
      if (autoNav && res.primary?.type === 'part' && res.primary.partId) {
        await navigate({ to: '/parts/$partId', params: { partId: res.primary.partId } });
      }
    } catch (e) {
      setError(e instanceof AppError ? e.message : t('common.error'));
      setResult(null);
    } finally {
      setBusy(false);
      setCode('');
      inputRef.current?.focus();
    }
  };

  const startCamera = async () => {
    setError(null);
    try {
      // @ts-expect-error experimental
      if (typeof window.BarcodeDetector === 'undefined') {
        setError(t('scan.noCameraApi'));
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamOn(true);
      // @ts-expect-error experimental
      const detector = new window.BarcodeDetector({
        formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'],
      });
      detectTimer.current = window.setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < 2) return;
        try {
          const codes = await detector.detect(video);
          const first = codes?.[0]?.rawValue;
          if (first) {
            stopCamera();
            await lookup(String(first), true);
          }
        } catch {
          // ignore frame errors
        }
      }, 400);
    } catch {
      setError(t('scan.cameraDenied'));
      stopCamera();
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <h1 className="text-xl font-semibold">{t('scan.title')}</h1>
      <p className="text-sm text-zinc-400">{t('scan.hint')}</p>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(code, true);
        }}
      >
        <input
          ref={inputRef}
          className="input font-mono text-lg"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('scan.placeholder')}
          autoComplete="off"
          autoFocus
          disabled={busy}
        />
        <div className="flex gap-2 flex-wrap">
          <button type="submit" className="btn-primary" disabled={busy || !code.trim()}>
            {busy ? '...' : t('scan.lookup')}
          </button>
          {camSupported && !camOn && (
            <button type="button" className="btn-ghost" onClick={() => void startCamera()}>
              {t('scan.startCamera')}
            </button>
          )}
          {camOn && (
            <button type="button" className="btn-ghost" onClick={stopCamera}>
              {t('scan.stopCamera')}
            </button>
          )}
        </div>
      </form>

      {camOn && (
        <video ref={videoRef} className="w-full rounded border border-border bg-black max-h-72" muted playsInline />
      )}

      {error && <div className="text-red-400 text-sm">{error}</div>}

      {result && (
        <div className="card space-y-2 text-sm">
          <div className="text-zinc-400">
            {t('scan.resultsFor')} <span className="font-mono text-zinc-200">{result.q}</span> — {result.count}
          </div>
          {result.count === 0 && <div className="text-zinc-500">{t('scan.none')}</div>}
          <ul className="space-y-2">
            {result.matches.map((m, i) => {
              const type = String(m.type);
              const id = String(m.id);
              if (type === 'part') {
                return (
                  <li key={`${type}-${id}-${i}`}>
                    <Link
                      to="/parts/$partId"
                      params={{ partId: id }}
                      className="text-accent hover:underline"
                    >
                      part · {String(m.name)} · {String(m.partNumber)}
                    </Link>
                  </li>
                );
              }
              if (type === 'lot' || type === 'label') {
                const partId = String(m.partId ?? '');
                return (
                  <li key={`${type}-${id}-${i}`}>
                    {partId ? (
                      <Link
                        to="/parts/$partId"
                        params={{ partId }}
                        className="text-accent hover:underline"
                      >
                        {type} · {String((m as { code?: string }).code ?? (m as { payload?: string }).payload ?? id)}
                      </Link>
                    ) : (
                      <span>
                        {type} · {id}
                      </span>
                    )}
                  </li>
                );
              }
              return (
                <li key={`${type}-${id}-${i}`}>
                  {type} · {String((m as { name?: string }).name ?? id)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
