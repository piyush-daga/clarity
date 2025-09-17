import { NextRequest, NextResponse } from 'next/server';

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const model = String(body?.model || process.env.GEMINI_MODEL || 'gemini-2.5-flash');
    const messages = (Array.isArray(body?.messages) ? body.messages : []) as ChatMessage[];
    if (messages.length === 0) {
      return NextResponse.json({ ok: false, error: 'messages[] required' }, { status: 400 });
    }

    const apiKey = String(body?.apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'Missing Gemini API key' }, { status: 400 });
    }

    const sys = messages.find((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    const contents = rest.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const payload: any = { contents };
    if (sys) payload.systemInstruction = { role: 'user', parts: [{ text: sys.content }] };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      return NextResponse.json({ ok: false, error: `Gemini error ${resp.status}: ${errText || resp.statusText}` }, { status: 400 });
    }

    const data = await resp.json();
    const text: string =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '')?.join('') ||
      data?.candidates?.[0]?.output || '';
    return NextResponse.json({ ok: true, content: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Unhandled error' }, { status: 500 });
  }
}

