import { useState } from 'react';
import { buildCampaignUrl, inspectCampaignUrl } from '@shared-domain/campaignLinks';
const inputClass='mt-1 w-full rounded-lg border border-slate-200 p-2 text-sm';
export default function CampaignLinkTools() {
  const [form,setForm]=useState({url:'https://subook.kr/',source:'instagram',medium:'cpc',campaign:'',id:'',content:''});
  const [output,setOutput]=useState(''); const [message,setMessage]=useState(''); const [checkUrl,setCheckUrl]=useState('');
  const check=checkUrl.trim()?inspectCampaignUrl(checkUrl):null;
  return <details className="rounded-2xl border border-slate-200 bg-white p-5">
    <summary className="cursor-pointer font-bold text-slate-900">광고·캠페인 URL 만들기와 점검</summary>
    <p className="my-3 text-xs leading-relaxed text-slate-500">캠페인 이름은 기간·목표별로, ID는 광고 관리자와 같게 입력하세요. 소재마다 content를 구분하세요. URL을 만든 뒤 실제 광고의 최종 주소에 적용해야 집계됩니다.</p>
    <form onSubmit={(event)=>{event.preventDefault();try{setOutput(buildCampaignUrl(form));setMessage('주소를 만들었습니다.');}catch(error){setOutput('');setMessage(error.message);}}}>
      <div className="grid gap-3 md:grid-cols-2">{[['url','랜딩 주소'],['source','출처 (instagram / facebook 등)'],['medium','매체 (광고 cpc / 일반 게시물 social)'],['campaign','캠페인 이름 (예: 202609_sales_jeonil)'],['id','캠페인 ID'],['content','소재 ID·구분명']].map(([key,label])=><label key={key} className="text-xs font-semibold text-slate-600">{label}<input className={inputClass} required value={form[key]} onChange={(e)=>setForm({...form,[key]:e.target.value})}/></label>)}</div>
      <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="submit">URL 생성</button>
    </form>
    {output&&<div className="mt-3"><textarea aria-label="생성된 캠페인 URL" className={inputClass} readOnly rows={3} value={output}/><button type="button" className="mt-2 text-sm underline" onClick={async()=>{try{await navigator.clipboard.writeText(output);setMessage('복사했습니다.');}catch{setMessage('위 주소를 선택해서 복사해 주세요.');}}}>주소 복사</button></div>}
    <p className="mt-2 text-sm text-slate-600" role="status">{message}</p>
    <label className="mt-5 block text-xs font-semibold text-slate-600">기존 최종 URL 점검<input className={inputClass} type="url" value={checkUrl} onChange={(e)=>setCheckUrl(e.target.value)} placeholder="광고에 설정된 최종 주소를 붙여 넣으세요"/></label>
    {check&&<p className={`mt-2 text-sm ${check.valid?'text-emerald-700':'text-amber-800'}`} role="status">{check.valid?'필수 UTM과 주소 형식을 확인했습니다. 실제 이동 후 태그 유지 여부도 확인해 주세요.':check.issues.join(' · ')}</p>}
  </details>;
}
