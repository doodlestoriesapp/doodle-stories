export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova',
        input: text,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let error;
      try {
        error = JSON.parse(errText);
      } catch {
        error = errText;
      }
      return res.status(response.status).json({ error });
    }

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ audio, format: 'mp3' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
