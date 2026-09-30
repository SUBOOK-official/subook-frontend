import test from 'node:test';
import assert from 'node:assert/strict';
import { bookTypeInputKey, changeRegisterRow, getBookTypeDecision, bookTypeSubmitFields } from './registerBookType.js';
const row = { title:'2026 메가스터디 수분감 수학1',subject:'',brand:'',bookType:'' };
const hint = (r, type) => ({key:bookTypeInputKey(r),status:'ready',data:{book_type:type,needs_review:!type}});
test('자동 제안은 수동 선택과 구분해서 제출한다', () => {
  assert.deepEqual(bookTypeSubmitFields(row,hint(row,'기출')), {book_type:'기출',book_type_source:'suggestion'});
});
test('유형을 선택하면 근거·체크 없이 즉시 등록할 수 있다', () => {
  const unknown={...row,title:'2025 강남대성 페넌트 레이스 영어 김대순T'};
  assert.equal(getBookTypeDecision(unknown,hint(unknown,null)).valid,false);
  const selected=changeRegisterRow(unknown,'bookType','N제');
  for (const status of [undefined,{key:bookTypeInputKey(selected),status:'loading'}, {key:bookTypeInputKey(selected),status:'error'}, hint(selected,null),hint(selected,'개념')]) {
    assert.deepEqual(bookTypeSubmitFields(selected,status),{book_type:'N제',book_type_source:'manual'});
  }
});
test('기존 초안의 선택값과 수정 중 선택값을 보존한다', () => {
  const selected={...row,bookType:'모의고사',bookTypeConfirmed:false,bookTypeReviewNote:''};
  for (const [field,value] of [['title','2027 킬링캠프'],['subject','수학'],['brand','메가스터디']]) {
    assert.equal(getBookTypeDecision(changeRegisterRow(selected,field,value),undefined).valid,true);
  }
  assert.equal(bookTypeSubmitFields(selected,hint(selected,'모의고사')).book_type_source,'manual');
});
test('제목·과목·브랜드가 다른 자동 응답은 적용하지 않는다', () => {
  for (const [field,value] of [['title','다른 상품'],['subject','과학'],['brand','다른 브랜드']]) {
    assert.equal(getBookTypeDecision({...row,[field]:value},hint(row,'기출')).valid,false);
  }
  assert.equal(getBookTypeDecision({...row,bookType:'EBS'},hint(row,null)).valid,false);
  assert.throws(()=>bookTypeSubmitFields(row,hint(row,null)),/유형을 확인/);
});
