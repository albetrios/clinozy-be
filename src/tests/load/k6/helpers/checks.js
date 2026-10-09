import { check } from 'k6';

/**
 * Standard response assertions for k6 tests.
 */
/** Checks the status against one expected status or a list of them. */
export function checkStatus(response, expectedStatus, name) {
  const expected = [].concat(expectedStatus);
  return check(response, {
    [`${name || 'response'} status is ${expected.join('|')}`]: (r) => expected.includes(r.status),
  });
}

export function checkOk(response, name) {
  return check(response, {
    [`${name || 'response'} is 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
}

export function checkResponseTime(response, maxMs, name) {
  return check(response, {
    [`${name || 'response'} time < ${maxMs}ms`]: (r) => r.timings.duration < maxMs,
  });
}

export function checkJsonBody(response, name) {
  return check(response, {
    [`${name || 'response'} has JSON body`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });
}

/** Records a functional check and aborts the journey on failure. */
export function assertCondition(condition, name) {
  if (!check(condition, { [name]: (value) => value })) throw new Error(name);
}

/** Requires an exact successful response and a public JSON data object/array. */
export function requireData(response, name) {
  assertCondition(response.status === 200, `${name}: exact 200`);
  let data;
  try {
    data = response.json('data');
  } catch {
    assertCondition(false, `${name}: valid JSON`);
  }
  assertCondition(data !== null && typeof data === 'object', `${name}: public data`);
  return data;
}

/** Fails setup instead of allowing an unauthenticated scenario to pass without work. */
export function requireScopedCredentials() {
  if (!(__ENV.TEST_TOKEN && __ENV.TEST_ORG_ID))
    throw new Error('TEST_TOKEN and TEST_ORG_ID required');
}
