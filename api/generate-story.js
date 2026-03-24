export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Fix media_type if needed
    if (body.messages) {
      body.messages = body.messages.map(msg => {
        if (Array.isArray(msg.content)) {
          msg.content = msg.content.map(block => {
            if (block.type === 'image' && block.source) {
              block.source.media_type = 'image/png';
            }
            return block;
          });
        }
        return msg;
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
