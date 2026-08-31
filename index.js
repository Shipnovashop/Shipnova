import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors({ origin: '*', allowHeaders: ['Content-Type', 'Authorization'], allowMethods: ['GET','POST','PUT','DELETE','OPTIONS'] }));

const json = (c, data, status=200) => c.json(data, status);
const auth = (c) => {
  const h = c.req.header('Authorization') || '';
  if (!h.startsWith('Bearer ')) return null;
  try { return JSON.parse(atob(h.slice(7))); } catch { return null; }
};
const token = (u) => btoa(JSON.stringify({id:u.id, name:u.name, email:u.email, role:u.role}));

app.get('/api/health', c => json(c, {ok:true, name:'ShipNova API', version:'1.0'}));

app.post('/api/auth/register', async c => {
  const b = await c.req.json();
  const {name,email,password,role='customer'} = b;
  if (!name || !email || !password) return json(c,{error:'name, email and password are required'},400);
  if (!['customer','seller'].includes(role)) return json(c,{error:'Invalid role'},400);
  const exists = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email.toLowerCase()).first();
  if (exists) return json(c,{error:'Email already registered'},409);
  const r = await c.env.DB.prepare('INSERT INTO users(name,email,password,role) VALUES(?,?,?,?) RETURNING id,name,email,role').bind(name,email.toLowerCase(),password,role).first();
  return json(c,{user:r,token:token(r)},201);
});

app.post('/api/auth/login', async c => {
  const {email,password} = await c.req.json();
  const u = await c.env.DB.prepare('SELECT id,name,email,role FROM users WHERE email=? AND password=?').bind((email||'').toLowerCase(),password||'').first();
  if (!u) return json(c,{error:'Invalid email or password'},401);
  return json(c,{user:u,token:token(u)});
});

app.get('/api/products', async c => {
  const seller = c.req.query('seller');
  const q = c.req.query('q');
  let sql='SELECT p.*, u.name seller_name FROM products p JOIN users u ON u.id=p.seller_id WHERE p.active=1';
  const args=[];
  if(seller){sql+=' AND p.seller_id=?';args.push(Number(seller));}
  if(q){sql+=' AND (p.name LIKE ? OR p.description LIKE ?)';args.push('%'+q+'%','%'+q+'%');}
  sql+=' ORDER BY p.id DESC';
  const r=await c.env.DB.prepare(sql).bind(...args).all();
  return json(c,{products:r.results||[]});
});

app.get('/api/products/:id', async c => {
  const p=await c.env.DB.prepare('SELECT p.*,u.name seller_name FROM products p JOIN users u ON u.id=p.seller_id WHERE p.id=?').bind(c.req.param('id')).first();
  return p?json(c,{product:p}):json(c,{error:'Product not found'},404);
});

app.post('/api/products', async c => {
  const u=auth(c); if(!u || !['seller','admin'].includes(u.role)) return json(c,{error:'Seller or admin login required'},401);
  const b=await c.req.json();
  if(!b.name || b.price===undefined) return json(c,{error:'name and price are required'},400);
  const sellerId=u.role==='admin' && b.seller_id ? Number(b.seller_id) : u.id;
  const seller=await c.env.DB.prepare('SELECT id FROM users WHERE id=? AND role IN (\'seller\',\'admin\')').bind(sellerId).first();
  if(!seller) return json(c,{error:'Invalid seller_id'},400);
  const p=await c.env.DB.prepare('INSERT INTO products(seller_id,name,description,price,stock,image,active) VALUES(?,?,?,?,?,?,1) RETURNING *').bind(sellerId,b.name,b.description||'',Number(b.price),Number(b.stock||0),b.image||'').first();
  return json(c,{product:p},201);
});

app.put('/api/products/:id', async c => {
  const u=auth(c); if(!u || !['seller','admin'].includes(u.role)) return json(c,{error:'Login required'},401);
  const p=await c.env.DB.prepare('SELECT * FROM products WHERE id=?').bind(c.req.param('id')).first();
  if(!p) return json(c,{error:'Product not found'},404);
  if(u.role==='seller' && p.seller_id!==u.id) return json(c,{error:'Not your product'},403);
  const b=await c.req.json();
  await c.env.DB.prepare('UPDATE products SET name=?,description=?,price=?,stock=?,image=?,active=? WHERE id=?').bind(b.name??p.name,b.description??p.description,Number(b.price??p.price),Number(b.stock??p.stock),b.image??p.image,b.active===undefined?p.active:(b.active?1:0),p.id).run();
  return json(c,{product:await c.env.DB.prepare('SELECT * FROM products WHERE id=?').bind(p.id).first()});
});

app.delete('/api/products/:id', async c => {
  const u=auth(c); if(!u || !['seller','admin'].includes(u.role)) return json(c,{error:'Login required'},401);
  const p=await c.env.DB.prepare('SELECT * FROM products WHERE id=?').bind(c.req.param('id')).first();
  if(!p) return json(c,{error:'Product not found'},404);
  if(u.role==='seller' && p.seller_id!==u.id) return json(c,{error:'Not your product'},403);
  await c.env.DB.prepare('DELETE FROM products WHERE id=?').bind(p.id).run();
  return json(c,{ok:true});
});

app.get('/api/users', async c => {
  const u=auth(c); if(!u || u.role!=='admin') return json(c,{error:'Admin login required'},401);
  const r=await c.env.DB.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id DESC').all();
  return json(c,{users:r.results||[]});
});

app.get('/api/stats', async c => {
  const u=auth(c); if(!u || u.role!=='admin') return json(c,{error:'Admin login required'},401);
  const [a,b,d]=await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) n FROM users WHERE role=\'customer\'').first(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM users WHERE role=\'seller\'').first(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM products').first()
  ]);
  return json(c,{customers:a.n,sellers:b.n,products:d.n});
});

app.get('/api/sellers', async c => {
  const r=await c.env.DB.prepare("SELECT id,name,email FROM users WHERE role='seller' ORDER BY name").all();
  return json(c,{sellers:r.results||[]});
});

export default app;


app.all('*', async c => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return json(c, {error:'Not found'}, 404);
});
