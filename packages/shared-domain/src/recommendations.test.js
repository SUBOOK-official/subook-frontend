import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankRecommendedProducts, rankPersonalizedProducts } from './recommendations.js';
test('recommendations span pages and preserve the popularity order of unselected items', () => {
 const products = Array.from({length: 40}, (_, id) => ({id: id + 1}));
 const ranked = rankRecommendedProducts(products, [{product_id:40, sort_order:0,is_enabled:true},{product_id:3,sort_order:1,is_enabled:false}]);
 assert.deepEqual(ranked.slice(0,3).map(p=>p.id), [40,1,2]);
 assert.equal(new Set(ranked.map(p=>p.id)).size,40);
 assert.equal(products[0].id,1);
});
test('matching subject and type leads; purchased and sold out products are excluded', () => {
 const products=[{id:1,subject:'국어',bookType:'기출'},{id:2,subject:'수학',bookType:'모의고사'},{id:3,subject:'수학',bookType:'기출'},{id:4,subject:'수학',isSoldOut:true}];
 assert.deepEqual(rankPersonalizedProducts(products,[{subject:'수학',bookType:'기출'}],[2]).map(p=>p.id),[3,1]);
});
