/** Request builders for route-handler tests. Handlers take a Web `Request`, so
 *  no server is involved and no port is bound. */

export function postJson(url: string, body: unknown, token?: string): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

export function get(url: string, token?: string): Request {
  return new Request(`http://localhost${url}`, {
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
  });
}

/** Route handlers receive `params` as a promise (Next 16). */
export function params<T extends Record<string, string>>(value: T): { params: Promise<T> } {
  return { params: Promise.resolve(value) };
}
