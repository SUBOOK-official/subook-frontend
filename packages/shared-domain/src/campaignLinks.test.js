import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCampaignUrl,inspectCampaignUrl } from './campaignLinks.js';
test('랜딩 쿼리·앵커 보존, 기존 UTM 교체, 공개 도메인·중복·빈 값 검증',()=>{
  const values={url:'https://subook.kr/?q=수학&utm_source=old#store',source:'Instagram',medium:'cpc',campaign:'202609_sales',id:'1234',content:'ad_1'};
  const url=new URL(buildCampaignUrl(values));
  assert.equal(url.searchParams.get('q'),'수학'); assert.equal(url.hash,'#store');
  assert.equal(url.searchParams.getAll('utm_source').length,1); assert.equal(url.searchParams.get('utm_source'),'instagram');
  assert.equal(inspectCampaignUrl(url.href).valid,true);
  for(const bad of ['https://evil.test','https://subook.kr@evil.test','https://subook.kr/order','javascript:alert(1)']) assert.throws(()=>buildCampaignUrl({...values,url:bad}));
  assert.throws(()=>buildCampaignUrl({...values,id:''}));
  assert.equal(inspectCampaignUrl(url.href+'&utm_source=duplicate').valid,true); // hash 내부는 쿼리가 아니다.
  url.hash=''; url.searchParams.append('utm_source','duplicate'); assert.equal(inspectCampaignUrl(url.href).valid,false);
});
