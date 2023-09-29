import { fastifyCors } from "@fastify/cors";
import fastify from "fastify";
import { generateAICompletionRoute } from "./routes/generate-ai-completion";
import { videoTranscriptionRoute } from "./routes/video-transcription";

const app = fastify();

app.register(fastifyCors, {
  origin: "*"
});

app.register(videoTranscriptionRoute);
app.register(generateAICompletionRoute);

app.listen({
  port: 3333
}).then(() => {
  console.log("HTTP Server Running!");
});