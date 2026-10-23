import { createServer } from 'vite';
import path from 'node:path';
import { repoRoot,qaRoot } from '../support.mjs';

export const product={id:900000,title:'수학 모의고사',brand:'시대인재',subject:'수학',book_type:'모의고사',published_year:2027};
export const books=[{id:900001,option:'7',price:6000,available_count:1},{id:900002,option:'7',price:6000,available_count:1},
  {id:900003,option:'10',price:8000,available_count:1},{id:900004,option:'11',price:8000,available_count:0,status:'sold_out'}];
const uid='00000000-0000-4000-8000-000000000912';
const now=new Date().toISOString();
export const user={id:uid,aud:'authenticated',role:'authenticated',email:'qa@example.invalid',email_confirmed_at:now,created_at:now,
  app_metadata:{provider:'kakao',providers:['kakao']},user_metadata:{name:'테스트 회원'}};
export function authPath(next='/store/900000') {
  const token=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture`;
  return `/auth/callback?next=${encodeURIComponent(next)}#${new URLSearchParams({access_token:token,refresh_token:'fixture-only',provider_token:'fixture-only',expires_in:'3600',token_type:'bearer',type:'signup'})}`;
}
export async function startUiServer(apiOrigin) {
  const origin='http://127.0.0.1:5198';
  const state={cart:[],identity:'verified',hang:false,calls:[],unexpected:[]};
  const allowedEmpty=new Set(['get_public_faqs','get_public_store_products','get_public_store_filters','get_public_banners','get_member_orders','get_member_addresses',
    'get_member_profile','get_my_coupons','get_my_points_summary','get_my_point_balance','get_notifications','get_unread_notification_count',
    'count_my_unread_notifications','get_applicable_coupons','get_member_recent_shipments','get_my_order_return_progress','get_my_orders',
    'get_my_pickup_requests_v2','get_my_points','get_my_settlements','get_public_reviews','is_subscribed_restock',
    'list_member_settlement_accounts','list_public_faqs','list_public_store_products','member_shipping_addresses','products','wishlist_items']);
  // env 파일을 읽지 않으며 process에 상속된 VITE 값도 사용하지 않는다.
  const saved=Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('VITE_')));
  for(const k of Object.keys(saved))delete process.env[k];
  Object.assign(process.env,{VITE_SUPABASE_PUBLIC_URL:origin+'/_supabase',VITE_SUPABASE_PUBLIC_ANON_KEY:'fixture-only',VITE_SUPABASE_URL:origin+'/_supabase',VITE_SUPABASE_ANON_KEY:'fixture-only'});
  const server=await createServer({configFile:path.join(repoRoot,'apps/public-web/vite.config.js'),envDir:path.join(qaRoot,'.no-env'),
    server:{host:'127.0.0.1',port:5198,strictPort:true},logLevel:'error',plugins:[{name:'qa-fixtures',configureServer(vite){
      vite.middlewares.use(async(req,res,next)=>{
        const url=new URL(req.url,origin);
        const json=(body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
        if(url.pathname==='/api/b2b-inquiry'){
          const chunks=[];for await(const c of req)chunks.push(c);
          const response=await fetch(apiOrigin+url.pathname,{method:req.method,headers:{'Content-Type':'application/json'},body:Buffer.concat(chunks)});
          const body=await response.json();state.calls.push({name:'b2b-inquiry',status:response.status});return json(body,response.status);
        }
        if(url.pathname==='/api/auth/kakao-phone')return json({success:true,status:'sms_required'});
        if(url.pathname.startsWith('/api/'))return json([]);
        if(!url.pathname.startsWith('/_supabase/'))return next();
        const name=url.pathname.split('/').pop();state.calls.push({name});
        if(name==='user')return json(user);
        if(name==='get_member_identity_policy')return json({enabled:true,email_required:true});
        if(state.hang&&['get_current_auth_account_role','get_my_member_identity'].includes(name))return;
        if(name==='get_my_member_identity')return json({enabled:true,status:state.identity});
        if(name==='get_current_auth_account_role')return json([{account_role:'member',user_id:uid,email:user.email,name:'테스트 회원',email_verified_at:now,terms_agreed_at:now}]);
        if(name==='get_public_store_product_detail')return json({product,options:books.map(b=>({...product,id:b.id,product_id:product.id,condition_grade:'S',status:'on_sale',...b})),related_products:[]});
        if(name==='get_cart_items')return json(state.cart);
        if(name==='add_to_cart'){
          const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));const b=books.find(x=>x.id===Number(body.p_book_id));
          if(!b||!b.available_count)return json({message:'fixture stock unavailable'},409);
          if(!state.cart.some(x=>x.book_id===b.id))state.cart.push({id:b.id+100,book_id:b.id,product_id:product.id,title:product.title,option_label:b.option,condition_grade:'S',price:b.price,quantity:1,subject:product.subject,brand:product.brand,is_sold_out:false});
          return json({cart_item_id:b.id+100});
        }
        if(name==='get_books_pricing_for_order')return json(books.map(b=>({id:b.id,book_id:b.id,price:b.price,status:b.status||'on_sale',is_public:true})));
        if(name==='get_member_dashboard_summary')return json({});
        // 보조 데이터 fixture 누락은 기록한다. 업무 검증 대상 RPC는 위에서 명시 처리한다.
        if(!allowedEmpty.has(name))state.unexpected.push(name);
        return json([]);
      });
    }}]});
  await server.listen();
  return {origin,state,reset(options={}){Object.assign(state,{cart:[],identity:'verified',hang:false,calls:[],unexpected:[]},options);},async close(){
    await server.close();for(const k of Object.keys(process.env).filter(k=>k.startsWith('VITE_')))delete process.env[k];Object.assign(process.env,saved);
  }};
}
