export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const VOICE_LINES = {
    welcome: "Woohoo! Welcome to Doodle Stories! You can upload your drawing OR draw one right here! Let's make some magic!",
    draw: "Time to get creative! Pick a colour, grab the brush, and draw anything you like! When you're done tap Use This Doodle!",
    age: "Ooooh what an AMAZING drawing! Now... how old is the little artist?",
    ageSelected: "Let's go make a story by tapping the big orange Make My Story button!",
    loading: "Hold on to your crayons! The story magic is happening right now! Your drawing is coming to LIFE!",
    story: "Ta-daaa! Your very own story is ready! A parent can save it to the bedtime library for other kids to enjoy!",
    library: "Welcome to the Bedtime Story Library! Every story here was made from a real kid's drawing! Pick one and snuggle up!",
    loved: "Oh my goodness! That story just got a LOVE! The author must be SO proud!",
    liked: "Wow, someone loved that story! What an amazing little author!",
  };

  const generateAudio = async (text) => {
    const stylePrompt = 'Read aloud in a warm, welcoming tone to a kid.';
    const fullText = `${stylePrompt}\n\n${text}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-preview-tts:generateContent?key=${process.env.GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Achernar' }
              }
            }
          }
        })
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));

    const pcmBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!pcmBase64) throw new Error('No audio returned');

    // Convert PCM to WAV
    const pcmBuffer = Buffer.from(pcmBase64, 'base64');
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(36 + dataSize, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(numChannels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(byteRate, 28);
    wavHeader.writeUInt16LE(blockAlign, 32);
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(dataSize, 40);
    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
    return wavBuffer.toString('base64');
  };

  try {
    const results = {};
    for (const [key, text] of Object.entries(VOICE_LINES)) {
      try {
        results[key] = await generateAudio(text);
      } catch (err) {
        results[key] = null; // Skip failed ones gracefully
      }
    }
    return res.status(200).json({ voices: results });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
