import { fastifyMultipart } from "@fastify/multipart";
import { FastifyInstance } from "fastify";
import { Document } from "langchain/document";
import { randomUUID } from "node:crypto";
import fs, { createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import { promisify } from "node:util";
import { openai } from "../lib/openai";
import { redis, redisVectorStore } from "../lib/redis";

const pump = promisify(pipeline);

export async function videoTranscriptionRoute(app: FastifyInstance) {
  app.register(fastifyMultipart, {
    limits: {
      fileSize: 1_048_576 * 25, //25mb
    }
  })

  app.post("/videos/upload", async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: "Missing file input." });
    }

    const extension = path.extname(data.filename);

    if (extension !== ".mp3") {
      return reply.status(400).send({ error: "Invlaid input type, please upload a MP3." });
    }

    const fileBaseName = path.basename(data.filename, extension);
    const fileUploadName = `${fileBaseName}-${randomUUID()}${extension}`;
    const uploadDestination = path.resolve(__dirname, "../../tmp", fileUploadName);

    await pump(data.file, fs.createWriteStream(uploadDestination));

    const audioReadStream = createReadStream(uploadDestination);

    // TODO: 
    // - Salvar o mp3 em um banco de dados
    // - Antes de fazer a transcrição validar se o vídeo ja existe
    //   se já existe apenas pega a transcrição do banco e retorna    

    const response = await openai.audio.transcriptions.create({
      file: audioReadStream,
      model: "whisper-1",
      language: "pt",
      response_format: "json",
      temperature: 0,
      prompt: data.filename
    });

    const transcription = response.text

    await redis.connect();

    await redisVectorStore.addDocuments([
      new Document({
        pageContent: transcription
      })]);

    await redis.disconnect();

    return { transcription }
  });
}