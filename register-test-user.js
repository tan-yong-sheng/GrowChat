import { chromium } from 'playwright';

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Register new test user via API
const registerRes = await page.request.post('http://localhost:8789/api/auth/register', {
  data: {
    email: 'test@test.com',
    name: 'Test User',
    password: 'TestPassword123'
  }
});

console.log('Register status:', registerRes.status());
const registerBody = await registerRes.json();
console.log('Register response:', JSON.stringify(registerBody, null, 2));

// Try login
if (registerRes.status() === 201) {
  const loginRes = await page.request.post('http://localhost:8789/api/auth/login', {
    data: {
      email: 'test@test.com',
      password: 'TestPassword123'
    }
  });
  
  console.log('\nLogin status:', loginRes.status());
  const loginBody = await loginRes.json();
  console.log('Login response:', JSON.stringify(loginBody, null, 2));
}

await browser.close();
