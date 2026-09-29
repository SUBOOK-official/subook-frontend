import { useEffect, useState } from 'react';
import { loadGrowthTrackingHealth } from '@shared-supabase/adminPerformanceClient';
import { formatPerformanceValue as fmt } from '@shared-domain/performanceMetrics';
export default function GrowthTrackingHealth({ range, ga, meta }) {
  const [data,setData]=useState(null); const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController(); setData(null);setError('');
    const timer=setTimeout(()=>controller.abort('timeout'),15000);
    loadGrowthTrackingHealth(range,ga?.transactionIds,controller.signal).then((result)=>{if(!controller.signal.aborted)setData(result);})
      .catch(()=>{if(!controller.signal.aborted||controller.signal.reason==='timeout')setError('계측 상태를 불러오지 못했습니다. 기간을 다시 선택하거나 새로고침해 주세요.');})
      .finally(()=>clearTimeout(timer));
    return()=>{clearTimeout(timer);controller.abort();};
  },[range,ga?.transactionIds]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="font-bold text-slate-900">실결제·수거 전환과 계측 상태</h2>
    {error?<p role="alert" className="mt-3 text-sm text-amber-800">{error}</p>:!data?<p className="mt-3 text-sm text-slate-500">조회 중…</p>:<>
      <div className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[['실결제 주문',data.paidOrders],['GA에서 같은 주문 확인',data.matchedOrders],['실제 수거 신청',data.pickupRequests],['서버 전송 실패',data.serverFailed]].map(([label,value])=><div className="rounded-lg bg-slate-50 p-3" key={label}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{fmt(value)}</p></div>)}</div>
      <p className="text-xs leading-relaxed text-slate-600">서버 계측 {data.serverEnabled?'활성':'연결 대기'} · 전송 수신 {fmt(data.serverAccepted)}건 / 대기 {fmt(data.serverPending)}건. HTTP 수신과 GA 보고서 반영은 다릅니다. 주문번호 대조는 선택 기간의 DB 결제일과 GA 이벤트일을 사용하므로 처리 지연·날짜 차이도 불일치에 포함됩니다.</p>
      {data.matchedOrders!=null&&<p className="mt-2 text-xs text-slate-600">DB 결제 중 GA 미확인 {fmt(data.paidOrders-data.matchedOrders)}건 · GA 거래 중 같은 기간 결제 미확인 {fmt(data.gaTransactionCount-data.matchedOrders)}건. 이 차이만으로 전부 계측 누락이라고 판단하지 않습니다.</p>}
      <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">캠페인별 DB 실결제와 UTM 확인</summary><div className="mt-2 overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['출처 / 매체','캠페인','ID','결제','순매출','Meta 광고비 / DB CPA'].map((label)=><th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>{data.campaigns.map((row,index)=>{
        const ad=meta?.breakdown?.find((item)=>item.id===row.campaign_id);
        const campaignOrders=data.campaigns.filter((item)=>item.campaign_id===row.campaign_id).reduce((sum,item)=>sum+Number(item.orders),0);
        return <tr className="border-t border-slate-100" key={index}><td className="p-2">{row.source||'미기록'} / {row.medium||'미기록'}</td><td className="p-2">{row.campaign||'미기록'}</td><td className="p-2">{row.campaign_id||'미기록'}</td><td className="p-2">{fmt(row.orders)}</td><td className="p-2">{fmt(row.net_revenue,'money')}</td><td className="p-2">{ad?`${fmt(ad.spend,'money')} / ${fmt(ad.spend/campaignOrders,'money')}`:'같은 캠페인 ID 필요'}</td></tr>;
      })}</tbody></table></div><p className="mt-2 text-xs text-slate-500">최종 유입 기준이며 CPA는 같은 캠페인 ID의 전체 실결제 주문을 분모로 합니다. 같은 ID의 여러 행에는 동일한 CPA가 표시됩니다. 태깅 누락·기여 기간 차이가 있어 광고 플랫폼 CPA와 동일하지 않습니다.</p></details>
    </>}
  </section>;
}
