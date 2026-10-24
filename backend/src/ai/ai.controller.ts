import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { Auth, CurrentUser, Lang, type AuthUser, type Locale } from '../auth/auth.decorators';
import { notFound, validationError } from '../common/errors';
import { toAiChat, type AiMessage } from '../common/serialize';
import { json } from '../common/util';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from './ai.service';

@ApiTags('ai')
@Controller('ai/chats')
@Auth()
export class AiController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  private async find(u: AuthUser, id: string) {
    const chat = await this.prisma.aiChat.findFirst({ where: { id, userId: u.id } });
    if (!chat) throw notFound('CHAT_NOT_FOUND', 'Chat not found');
    return chat;
  }

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const chats = await this.prisma.aiChat.findMany({ where: { userId: u.id }, orderBy: { updatedAt: 'desc' }, take: 100 });
    return chats.map((c) => {
      const { messages, ...rest } = toAiChat(c);
      return { ...rest, messagesCount: messages.length };
    });
  }

  @Post()
  async create(@CurrentUser() u: AuthUser, @Body() body: { title?: unknown }) {
    const title = String(body?.title ?? '').trim().slice(0, 80) || 'Yangi suhbat';
    return toAiChat(await this.prisma.aiChat.create({ data: { userId: u.id, title, messages: [] } }));
  }

  @Get(':id')
  async get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return toAiChat(await this.find(u, id));
  }

  @Patch(':id')
  async rename(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { title?: unknown }) {
    await this.find(u, id);
    const title = String(body?.title ?? '').trim();
    if (!title) validationError({ title: 'REQUIRED' });
    return toAiChat(await this.prisma.aiChat.update({ where: { id }, data: { title: title.slice(0, 80) } }));
  }

  @Delete(':id')
  async remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    await this.find(u, id);
    await this.prisma.aiChat.delete({ where: { id } });
    return { ok: true };
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 15, ttl: 60000 } })
  async send(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() body: { content?: unknown }, @Lang() locale: Locale) {
    const chat = await this.find(u, id);
    const content = String(body?.content ?? '').trim();
    if (!content) validationError({ content: 'REQUIRED' });
    const messages = json<AiMessage[]>(chat.messages, []);
    const userMessage: AiMessage = { id: randomUUID(), role: 'user', content: content.slice(0, 4000), createdAt: new Date().toISOString() };
    messages.push(userMessage);

    const reply = await this.ai.reply(u, locale, messages);
    const assistantMessage: AiMessage = { id: randomUUID(), role: 'assistant', createdAt: new Date().toISOString(), ...reply };
    messages.push(assistantMessage);

    const updated = await this.prisma.aiChat.update({
      where: { id },
      data: { messages: messages.slice(-200) as object[], ...(messages.length === 2 ? { title: content.slice(0, 48) } : {}) },
    });
    return { userMessage, assistantMessage, chat: toAiChat(updated) };
  }
}
