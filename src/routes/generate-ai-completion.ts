import { streamToResponse } from "ai";
import { FastifyInstance } from "fastify";
import { RetrievalQAChain } from "langchain/chains";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { PromptTemplate } from "langchain/prompts";
import { z } from "zod";
import { redis, redisVectorStore } from "../lib/redis";

export async function generateAICompletionRoute(app: FastifyInstance) {
  app.post("/ai/complete", async (req, reply) => {

    const messageSchema = z.object({
      role: z.string(),
      content: z.string(),
    });

    const messagesSchema = z.object({
      messages: z.array(messageSchema),
    });

    const { messages } = messagesSchema.parse(req.body);
    const { content } = messages[messages.length - 1];

    const prompt = new PromptTemplate({
      template: `
      Você responde perguntas sobre um sistema de laboratório.
      O usuário está precisa tirar dúvidas referentes ao sistema.
      Use apenas o conteúdo das transcições abaixo para responder a pergunta do usuário.
      Se a resposta não for encontrada nas transcrições, responda que você não sabe, não tente inventar uma resposta.
    
      Transcrições:
      {context}
    
      Pergunta:
      {question}
      `.trim(),
      inputVariables: ['context', 'question']
    });

    const openAiChat = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.3
    });

    const chain = RetrievalQAChain.fromLLM(
      openAiChat,
      redisVectorStore.asRetriever(3),
      {
        returnSourceDocuments: true,
        prompt,
        verbose: true
      }
    );

    await redis.connect();

    const response = await chain.call(
      {
        query: content
      }
    );

    await redis.disconnect();

    const textEncoder = new TextEncoder();
    const fakeStream = new ReadableStream({
      async start(controller) {
        for (const character of response.text) {
          controller.enqueue(textEncoder.encode(character));
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        controller.close();
      },
    });

    streamToResponse(fakeStream, reply.raw, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
      }
    });
  });
}