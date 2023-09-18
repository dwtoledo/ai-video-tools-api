import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import { openAI } from '../lib/openai'
import { streamToResponse, OpenAIStream } from 'ai'

const bodySchema = z.object({
  videoId: z.string().uuid(),
  template: z.string(),
  temperature: z.number().min(0).max(1).default(0.5),
})

async function generateAIResult(temperature, promptUserMessage) {
  return await openAI.chat.completions.create({
    model: 'gpt-3.5-turbo-16k',
    temperature,
    messages: [
      {
        role: 'user',
        content: promptUserMessage,
      },
    ],
    stream: true,
  })
}

export async function generateAIResultRoute(app: FastifyInstance) {
  app.post('/ai/result', async (request, response) => {
    try {
      const { videoId, template, temperature } = bodySchema.parse(request.body)

      const video = await prisma.videos.findUniqueOrThrow({
        where: {
          id: videoId,
        },
      })

      if (!video.transcription) {
        return response
          .status(400)
          .send({ error: 'Video transcription was not generated yet.' })
      }

      const promptWithTranscription = template.replace(
        '{transcription}',
        video.transcription,
      )

      const aiResult = await generateAIResult(
        temperature,
        promptWithTranscription,
      )

      const stream = OpenAIStream(aiResult)

      streamToResponse(stream, response.raw, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        },
      })
    } catch (err) {
      if (err instanceof z.ZodError)
        response.status(400).send({ error: err.issues })
    }
  })
}