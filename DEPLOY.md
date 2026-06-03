# Deploy Steps

## 1. NTA API Key
Register free at https://developer.nationaltransport.ie → create app → copy key.

## 2. Install & test locally
```bash
cd transit-tracker
npm install
npx vercel dev          # runs on http://localhost:3000
```
Set NTA key for local dev:
```bash
echo "NTA_API_KEY=your_key_here" > .env.local
```

## 3. Deploy to Vercel (free)
```bash
npx vercel login        # GitHub/email login
npx vercel              # follow prompts → get shareable URL
```
Then add the secret:
```bash
npx vercel env add NTA_API_KEY production
# paste your NTA key when prompted
npx vercel --prod       # redeploy with env var
```
Share the `*.vercel.app` URL with anyone.

## 4. Auto-redeploy
Connect the repo to Vercel via vercel.com dashboard → every git push auto-deploys.

## Irish Rail station codes used
- CFON = Clondalkin/Fonthill
- DRUM = Drumcondra
