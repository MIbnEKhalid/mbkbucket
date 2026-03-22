function normalizeBooleanLike(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 't', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', 'f', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return value;
}

export function parseAndValidateMbkbucketVar(rawValue) {
  const errors = [];
  let parsed;

  try {
    parsed = rawValue ? JSON.parse(rawValue) : {};
  } catch {
    throw new Error('Invalid JSON in process.env.mbkbucketVar');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('mbkbucketVar must be a valid object');
  }

  const defaults = {
    p_view_inline: true,
    publiView_enabled: false
  };

  for (const [key, defaultVal] of Object.entries(defaults)) {
    const current = parsed[key];
    if (current === undefined || (typeof current === 'string' && current.trim() === '')) {
      parsed[key] = defaultVal;
    }
  }

  parsed.p_view_inline = normalizeBooleanLike(parsed.p_view_inline);
  parsed.publiView_enabled = normalizeBooleanLike(parsed.publiView_enabled);

  if (typeof parsed.p_view_inline !== 'boolean') {
    errors.push('mbkbucketVar.p_view_inline must be a boolean if provided');
  }
  if (typeof parsed.publiView_enabled !== 'boolean') {
    errors.push('mbkbucketVar.publiView_enabled must be a boolean if provided');
  }

  if (errors.length) {
    throw new Error(errors.join(' | '));
  }

  return parsed;
}

export function parseAndValidateBucketConnection(rawValue) {
  if (!rawValue) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    throw new Error('BucketConnection is not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw new Error('BucketConnection must be a non-empty object');
  }

  const requiredFields = ['BUCKET_NAME', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY', 'ENDPOINT'];

  for (const [bucketName, config] of Object.entries(parsed)) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Bucket '${bucketName}' configuration must be an object, not a string. Remove quotes around the inner JSON object.`);
    }

    const missingFields = requiredFields.filter((field) => !config[field]);
    if (missingFields.length) {
      throw new Error(`Bucket '${bucketName}' is missing required fields: ${missingFields.join(', ')}`);
    }
  }

  return parsed;
}

export { normalizeBooleanLike };
