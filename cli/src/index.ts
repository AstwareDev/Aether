import express, { Request, Response } from 'express';
import { generateAIResponse } from './aiRouter';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/api/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider, model, prompt, systemPrompt } = req.body;

    if (!provider || !prompt) {
      res.status(400).json({ error: 'Missing required "provider" or "prompt" fields.' });
      return;
    }

    const textOutput = await generateAIResponse({ provider, model, prompt, systemPrompt });
    res.json({ success: true, response: textOutput });
    
  } catch (error: any) {
    console.error('[AI Error]:', error);
    res.status(500).json({ success: false, error: error.message || 'AI Generation Failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[Aether Core]: Route gateway operational on http://localhost:${PORT}`);
});