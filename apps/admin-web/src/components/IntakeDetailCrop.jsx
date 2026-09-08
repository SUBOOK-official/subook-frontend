import { useEffect, useRef, useState } from 'react';
import AdminDialog from './AdminDialog';
import { readIntakePhoto } from '../lib/intakeCollection';
import { validIntakeCrop } from '../lib/intakePhotoCrop';

export default function IntakeDetailCrop({ photos, disabled, onProcess }) {
  const [editing, setEditing] = useState(null), [source, setSource] = useState(''), [rect, setRect] = useState(null), [error, setError] = useState('');
  const start = useRef(null);
  const [aspect, setAspect] = useState(1);
  useEffect(() => {
    if (!editing) return undefined;
    let active = true, url;
    readIntakePhoto(editing.id).then((blob) => {
      if (!blob) throw new Error('원본이 없습니다. 다시 촬영하세요.');
      if (active) { url = URL.createObjectURL(blob); setSource(url); }
    }).catch((failure) => { if (active) setError(failure.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [editing]);
  const close = () => { start.current = null; setEditing(null); setSource(''); setRect(null); setError(''); };
  return <div className="space-y-3">{photos.filter((photo) => photo.slot !== 'cover').map((photo, index) => <div key={photo.id} className="rounded-lg border border-slate-200 p-3">
    <p className="text-sm font-semibold">내지 {index + 1} · {photo.uploadState === 'queued' ? '정리·업로드 중' : photo.cropStatus === 'applied' ? '검은 배경 정리 완료' : photo.cropStatus === 'manual' ? '직접 자르기 적용' : photo.cropStatus === 'original' ? '원본 사용 중' : '원본 유지 · 필요하면 직접 자르기'}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-blue-700">{[['auto', '배경 자동 정리'], ['original', '원본 사용']].map(([mode, label]) => <button key={mode} type="button" disabled={disabled || photo.uploadState === 'queued'} className="underline disabled:opacity-40" onClick={() => onProcess(photo, { mode })}>{label}</button>)}<button type="button" disabled={disabled || photo.uploadState === 'queued'} className="underline disabled:opacity-40" onClick={() => { setEditing(photo); setRect(null); }}>직접 자르기</button></div>
  </div>)}
    <AdminDialog open={Boolean(editing)} onClose={close} title="내지 자르기" bodyClassName="space-y-3"><div className="space-y-3 p-4"><p className="text-sm text-slate-600">사진에서 남길 종이 영역을 드래그하세요. 등록 전까지 원본으로 되돌릴 수 있습니다.</p>
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      {source ? <div className="relative mx-auto touch-none select-none" style={{ width: `min(100%, ${48 * aspect}vh)` }} onPointerDown={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); start.current = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }; event.currentTarget.setPointerCapture(event.pointerId); setRect(null); }} onPointerMove={(event) => {
        if (!start.current) return; const bounds = event.currentTarget.getBoundingClientRect(); const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)); setRect({ x: Math.min(x, start.current.x), y: Math.min(y, start.current.y), width: Math.abs(x - start.current.x), height: Math.abs(y - start.current.y) });
      }} onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}><img src={source} alt="자를 영역을 선택할 원본 내지" onLoad={(event) => setAspect(event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)} draggable={false} className="block w-full" />{rect ? <div className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/10" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} /> : null}</div> : null}
      <div className="grid grid-cols-4 gap-2">{['x', 'y', 'width', 'height'].map((key, index) => <label key={key} className="text-xs">{['왼쪽', '위쪽', '너비', '높이'][index]} %<input type="number" min="0" max="100" aria-label={`자르기 ${key}`} className="mt-1 w-full rounded border p-2" value={rect ? Math.round(rect[key] * 100) : ''} onChange={(event) => setRect((value) => ({ ...(value || { x: 0, y: 0, width: 1, height: 1 }), [key]: Number(event.target.value) / 100 }))} /></label>)}</div>
      <button type="button" disabled={disabled || !validIntakeCrop(rect)} className="w-full rounded-lg bg-blue-700 p-3 font-bold text-white disabled:opacity-40" onClick={() => { onProcess(editing, { mode: 'manual', rect }); close(); }}>선택 영역 적용</button>
    </div></AdminDialog>
  </div>;
}
