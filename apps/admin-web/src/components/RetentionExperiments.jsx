import { useEffect,useState } from 'react';
import { retentionExperimentAction } from '@shared-supabase/adminPerformanceClient';
import { formatPerformanceValue as fmt } from '@shared-domain/performanceMetrics';
const button='rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-50';
export default function RetentionExperiments(){
  const [rows,setRows]=useState([]),[name,setName]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [reload,setReload]=useState(0);
  useEffect(()=>{let active=true;retentionExperimentAction('list').then((data)=>{if(active)setRows(data);}).catch((error)=>{if(active)setMessage(error.message);});return()=>{active=false;};},[reload]);
  const run=async(action,args)=>{setBusy(true);setMessage('');try{await retentionExperimentAction(action,args);setReload((v)=>v+1);setMessage(action==='create'?'대상을 고정했습니다. 아직 발송하거나 측정을 시작하지 않았습니다.':'측정을 시작했습니다. 14일 후 결과를 비교하세요.');}catch(error){setMessage(error.message);}finally{setBusy(false);}};
  const download=async(row)=>{
    setBusy(true);
    try {
    const freshRows=await retentionExperimentAction('list');setRows(freshRows);
    const fresh=freshRows.find((item)=>item.id===row.id);
    if(!fresh)throw new Error('실험 대상을 다시 확인해 주세요.');
    const content='user_id\r\n'+fresh.contactIds.join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`retention-${row.id}-treatment.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage('내려받기 직전 수신 동의를 다시 확인했습니다. 발송 도구에서도 현재 동의 상태를 확인해 주세요.');
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  };
  return <details className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer font-bold">재방문 CRM 대조군 실험</summary>
    <p className="my-3 text-xs leading-relaxed text-slate-600">최근 14~90일 내 구매한 마케팅 수신 동의 회원을 50:50으로 배정합니다. 차단·탈퇴·개인정보 삭제·최근 30일 다른 실험 대상은 제외합니다. 대상 생성은 발송하지 않습니다. 대조군에는 실험 메시지를 보내지 마세요.</p>
    <form className="flex flex-wrap gap-2" onSubmit={(event)=>{event.preventDefault();void run('create',{p_name:name,p_window_days:14});}}><input aria-label="재방문 실험 이름" className="min-w-0 rounded-lg border border-slate-200 p-2 text-sm" required minLength={2} maxLength={80} value={name} onChange={(e)=>setName(e.target.value)} placeholder="예: 10월 관심 교재 안내"/><button disabled={busy} className={button} type="submit">대상·대조군 고정</button><button disabled={busy} className={button} type="button" onClick={()=>setReload((v)=>v+1)}>동의 상태·결과 새로고침</button></form>
    <p role="status" className="my-3 text-sm text-slate-600">{message}</p>
    <div className="space-y-4">{rows.map((row)=>{
      const treatment=row.arms.find((a)=>a.arm==='treatment');const holdout=row.arms.find((a)=>a.arm==='holdout');
      const rate=(a)=>a?.members?100*a.buyers/a.members:null;
      const delta=treatment?.members&&holdout?.members?rate(treatment)-rate(holdout):null;
      return <article key={row.id} className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{row.name}</h3>
        <p className="my-2 text-xs text-slate-500">{row.startedAt?`${row.mature?'관측 기간 완료':'관측 중'} · ${new Date(row.startedAt).toLocaleString('ko-KR')}부터 ${row.windowDays}일`:'준비됨 · 24시간 안에 발송과 측정 시작을 완료하세요.'}</p>
        <div className="grid gap-2 sm:grid-cols-2">{[['treatment','안내 대상'],['holdout','대조군']].map(([key,label])=>{const a=row.arms.find((item)=>item.arm===key);return <p className="rounded-lg bg-slate-50 p-3 text-xs" key={key}>{label}: {fmt(a?.members||0)}명{row.startedAt?` · 구매 ${fmt(a?.buyers||0)}명 (${fmt(rate(a),'percent')}) · 순매출 ${fmt(a?.net_revenue||0,'money')}`:''}</p>;})}</div>
        {row.startedAt?<p className="mt-3 text-xs text-slate-600">구매율 차이 {fmt(delta,'percent')}p · 비용·기여이익을 별도로 대조해야 합니다. 표본과 관측 기간이 작으면 우열을 확정하지 마세요.</p>:<div className="mt-3 flex flex-wrap gap-2"><button className={button} type="button" onClick={()=>download(row)}>현재 동의한 안내 대상 ID 내려받기</button><button className={button} disabled={busy||!treatment?.members||!holdout?.members} type="button" onClick={()=>{if(window.confirm('안내 대상에게 수동 발송을 마쳤고 대조군에는 발송하지 않았나요? 확인하면 지금부터 14일 측정을 시작합니다.'))void run('start',{p_id:row.id,p_cost:0});}}>수동 발송 완료 · 측정 시작</button></div>}
      </article>;
    })}</div>
  </details>;
}
