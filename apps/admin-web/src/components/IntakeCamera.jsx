import { useCallback, useEffect, useRef, useState } from 'react';

export default function IntakeCamera({ onCapture, disabled, label }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const generationRef = useRef(0);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const [rotation, setRotation] = useState(0);
  const [saving, setSaving] = useState(false);
  const captureLock = useRef(false);
  const stop = useCallback(() => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setConnected(false);
    setConnecting(false);
  }, []);
  useEffect(() => () => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function connect(selected = deviceId) {
    stop();
    const generation = generationRef.current;
    setError(''); setConnecting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('이 브라우저에서 카메라를 사용할 수 없습니다. Chrome·Edge의 HTTPS 화면에서 열어주세요.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        ...(selected ? { deviceId: { exact: selected } } : {}),
        width: { ideal: 2560 }, height: { ideal: 1920 },
      } });
      if (generation !== generationRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setConnected(true);
      const cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
      if (generation !== generationRef.current) return;
      setDevices(cameras);
      setDeviceId(stream.getVideoTracks()[0]?.getSettings().deviceId || selected);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (generation !== generationRef.current) return;
        stop(); setError('카메라 연결이 끊겼습니다. 다시 연결하세요.');
      }, { once: true });
    } catch (err) {
      if (generation !== generationRef.current) return;
      stop();
      setError(err.name === 'NotAllowedError' ? '주소창의 카메라 권한을 허용한 뒤 다시 연결하세요.'
        : err.name === 'NotReadableError' ? 'CZUR 프로그램 등에서 카메라를 사용 중인지 확인한 뒤 다시 연결하세요.'
          : err.name === 'NotFoundError' || err.name === 'OverconstrainedError' ? '카메라를 찾지 못했습니다. CZUR 연결·스캔 모드를 확인하세요.' : err.message);
    } finally { if (generation === generationRef.current) setConnecting(false); }
  }
  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (disabled || captureLock.current || !connected || !video?.videoWidth) return;
    captureLock.current = true; setSaving(true); setError('');
    try {
    const canvas = document.createElement('canvas');
    const sideways = rotation % 180 !== 0;
    canvas.width = sideways ? video.videoHeight : video.videoWidth;
    canvas.height = sideways ? video.videoWidth : video.videoHeight;
    const context = canvas.getContext('2d');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(video, -video.videoWidth / 2, -video.videoHeight / 2);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('촬영한 사진을 저장하지 못했습니다. 다시 촬영하세요.');
    await onCapture(new File([blob], `czur-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    } catch (err) { setError(err.message || '촬영에 실패했습니다. 다시 시도하세요.'); }
    finally { captureLock.current = false; setSaving(false); }
  }, [connected, disabled, onCapture, rotation]);
  useEffect(() => {
    const handleKey = (event) => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey
        || event.target.closest('input,textarea,select,button,[contenteditable="true"]')) return;
      if (!connected || disabled) return;
      event.preventDefault(); capture();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [capture, connected, disabled]);
  return <section className="rounded-xl border border-slate-200 bg-white p-4" aria-label="CZUR 카메라">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">카메라 <span className={`ml-2 text-xs ${connected ? 'text-emerald-700' : 'text-slate-500'}`}>{connected ? '연결됨' : '연결 대기'}</span></h2>
      {connected ? <button type="button" onClick={stop} className="text-sm text-slate-500 underline">연결 해제</button> : null}
    </div>
    <div className="relative flex aspect-[4/3] max-h-[38vh] items-center justify-center overflow-hidden rounded-lg bg-slate-950">
      <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-contain" style={{ transform: `rotate(${rotation}deg)`, ...(rotation % 180 ? { width: '75%', height: '75%' } : {}) }} />
      {!connected ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white"><p>CZUR를 연결하고 스캔 모드로 전환하세요.</p><button type="button" onClick={() => connect()} disabled={connecting} className="rounded-lg bg-white px-5 py-3 font-bold text-slate-900 disabled:opacity-50">{connecting ? '연결 중…' : '카메라 연결'}</button></div> : null}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p> : null}
    <div className="mt-3 flex gap-2">
      {devices.length ? <select aria-label="촬영 카메라" value={deviceId} onChange={(event) => { setDeviceId(event.target.value); connect(event.target.value); }} disabled={connecting} className="min-w-0 flex-1 rounded-lg border border-slate-300 p-2 text-sm">{devices.map((device,index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `카메라 ${index+1}`}</option>)}</select> : null}
      <button type="button" onClick={() => setRotation((angle) => (angle + 90) % 360)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">90° 회전</button>
    </div>
    <button type="button" onClick={capture} disabled={!connected || disabled || saving} className="mt-3 w-full rounded-lg bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-40">{saving ? '사진 저장 중…' : label} <span className="ml-2 text-xs font-normal">Space</span></button>
    <label className={`mt-3 block cursor-pointer text-center text-sm text-slate-600 underline ${disabled || saving ? 'opacity-40' : ''}`}>사진 파일 선택<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={disabled || saving} onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file || captureLock.current) return;
      captureLock.current = true; setSaving(true); setError('');
      try { await onCapture(file); } catch (err) { setError(err.message || '사진을 저장하지 못했습니다.'); }
      finally { captureLock.current = false; setSaving(false); }
    }} /></label>
  </section>;
}
