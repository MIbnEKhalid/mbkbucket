/**
 * MBKBucket - Google Drive Authentication & OAuth Helpers
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 */

import crypto from "node:crypto";
import { createLogger } from "#logger";

const debugAuth = createLogger('gdrive-auth');

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

export function getGoogleAuthUrl({
  clientId,
  redirectUri,
  state = '',
  scopes = GOOGLE_DRIVE_SCOPES,
  prompt = 'consent',
  accessType = 'offline'
}) {
  if (!clientId) throw new Error('clientId is required for Google OAuth');
  if (!redirectUri) throw new Error('redirectUri is required for Google OAuth');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: Array.isArray(scopes) ? scopes.join(' ') : String(scopes),
    access_type: accessType,
    prompt: prompt,
    include_granted_scopes: 'true',
    ...(state && { state })
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens({
  code,
  clientId,
  clientSecret,
  redirectUri
}) {
  if (!code) throw new Error('Authorization code is required');
  if (!clientId || !clientSecret) throw new Error('clientId and clientSecret are required');

  debugAuth('Exchanging auth code for tokens with clientId=%s', clientId);

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri || 'postmessage',
    grant_type: 'authorization_code'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to exchange Google OAuth code: ${data.error_description || data.error || res.statusText}`);
  }

  const expiry_date = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return { ...data, expiry_date };
}

export async function refreshGoogleAccessToken({
  clientId,
  clientSecret,
  refreshToken
}) {
  if (!refreshToken) throw new Error('refreshToken is required');
  if (!clientId || !clientSecret) throw new Error('clientId and clientSecret are required');

  debugAuth('Refreshing access token for clientId=%s', clientId);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Failed to refresh Google access token: ${data.error_description || data.error || res.statusText}`);
  }

  const expiry_date = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return { ...data, expiry_date };
}

export async function getServiceAccountAccessToken({
  clientEmail,
  privateKey,
  scopes = GOOGLE_DRIVE_SCOPES
}) {
  if (!clientEmail || !privateKey) {
    throw new Error('clientEmail and privateKey are required for Service Account authentication');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: Array.isArray(scopes) ? scopes.join(' ') : String(scopes),
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const base64Url = str => Buffer.from(str).toString('base64url');
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedClaim = base64Url(JSON.stringify(claim));
  const signatureInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signatureInput);
  signer.end();
  const signature = signer.sign(privateKey, 'base64url');
  const jwt = `${signatureInput}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Service Account token request failed: ${data.error_description || data.error || res.statusText}`);
  }

  const expiry_date = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return { access_token: data.access_token, expires_in: data.expires_in, expiry_date };
}
