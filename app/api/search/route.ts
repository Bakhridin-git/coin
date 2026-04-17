import { NextResponse } from 'next/server';
import { getSearchSuggestions } from '../../../lib/services/search';

const MAX_QUERY_LEN = 200;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  if (q.length > MAX_QUERY_LEN) {
    return NextResponse.json({ results: [] }, { status: 400 });
  }
  const results = await getSearchSuggestions(q);
  return NextResponse.json({ results });
}
