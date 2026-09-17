import fs from 'node:fs';
import path from 'node:path';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  FileBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { getConfig } from '../config';

export const CONTAINERS_DIR = path.join(process.cwd(), 'data', 'containers');

export type ButtonStyleName = 'Primary' | 'Secondary' | 'Success' | 'Danger' | 'Link';

export interface ContainerTextPart {
  type: 'text';
  content: string;
}

export interface ContainerSeparatorPart {
  type: 'separator';
  divider?: boolean;
}

export interface ContainerBannerPart {
  type: 'banner';
}

export interface ContainerFooterPart {
  type: 'footer';
}

export interface ContainerFilePart {
  type: 'file';
  url: string;
}

export interface ContainerSelectOption {
  label: string;
  value: string;
  description?: string;
}

export interface ContainerStringSelectPart {
  type: 'string_select';
  customId: string;
  placeholder?: string;
  options: ContainerSelectOption[];
}

export interface ContainerChannelSelectPart {
  type: 'channel_select';
  customId: string;
  placeholder?: string;
  channelTypes?: ('text' | 'category' | 'announcement')[];
}

export interface ContainerRoleSelectPart {
  type: 'role_select';
  customId: string;
  placeholder?: string;
}

export interface ContainerButtonDef {
  customId?: string;
  label: string;
  style: ButtonStyleName;
  /** For Link buttons — opens this URL. */
  url?: string;
  /** Include only when `vars[when]` is truthy (`"true"` or non-empty). Omit to always show. */
  when?: string;
  /** Include only when `vars[whenNot]` is falsy. */
  whenNot?: string;
}

export interface ContainerButtonsPart {
  type: 'buttons';
  buttons: ContainerButtonDef[];
}

export type ContainerPart =
  | ContainerTextPart
  | ContainerSeparatorPart
  | ContainerBannerPart
  | ContainerFooterPart
  | ContainerFilePart
  | ContainerStringSelectPart
  | ContainerChannelSelectPart
  | ContainerRoleSelectPart
  | ContainerButtonsPart;

export interface ContainerDefinition {
  name: string;
  parts: ContainerPart[];
}

const STYLE_MAP: Record<ButtonStyleName, ButtonStyle> = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
  Link: ButtonStyle.Link,
};

const CHANNEL_TYPE_MAP = {
  text: ChannelType.GuildText,
  category: ChannelType.GuildCategory,
  announcement: ChannelType.GuildAnnouncement,
} as const;

export function ensureContainersDir(): void {
  if (!fs.existsSync(CONTAINERS_DIR)) {
    fs.mkdirSync(CONTAINERS_DIR, { recursive: true });
  }
}

export function applyPlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, value);
  }
  return out;
}

export function loadContainerDef(name: string): ContainerDefinition {
  ensureContainersDir();
  const file = path.join(CONTAINERS_DIR, `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing container definition: data/containers/${name}.json`);
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as ContainerDefinition;
  return { name, parts: raw.parts ?? [] };
}

export function saveContainerDef(name: string, def: ContainerDefinition): void {
  ensureContainersDir();
  const file = path.join(CONTAINERS_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify({ name, parts: def.parts }, null, 2) + '\n', 'utf8');
}

/** Returns the first text part (used when editing auto-replies). */
export function getContainerText(name: string): string {
  const def = loadContainerDef(name);
  const text = def.parts.find((p): p is ContainerTextPart => p.type === 'text');
  return text?.content ?? '';
}

export function setContainerText(name: string, content: string): void {
  const def = loadContainerDef(name);
  const idx = def.parts.findIndex((p) => p.type === 'text');
  if (idx >= 0) {
    (def.parts[idx] as ContainerTextPart).content = content;
  } else {
    def.parts.unshift({ type: 'text', content });
  }
  saveContainerDef(name, def);
}

function truthy(v: string | undefined): boolean {
  if (v == null || v === '') return false;
  return v !== 'false' && v !== '0';
}

export function buildContainerFromDef(
  def: ContainerDefinition,
  vars: Record<string, string> = {},
): ContainerBuilder {
  const config = getConfig();
  const container = new ContainerBuilder();

  for (const part of def.parts) {
    switch (part.type) {
      case 'banner':
        if (config.banner) {
          container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder().setURL(config.banner),
            ),
          );
        }
        break;
      case 'footer':
        if (config.footer) {
          container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder().setURL(config.footer),
            ),
          );
        }
        break;
      case 'separator':
        container.addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(part.divider !== false)
            .setSpacing(SeparatorSpacingSize.Small),
        );
        break;
      case 'text':
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(applyPlaceholders(part.content, vars)),
        );
        break;
      case 'file':
        container.addFileComponents(
          new FileBuilder().setURL(applyPlaceholders(part.url, vars)),
        );
        break;
      case 'string_select': {
        const select = new StringSelectMenuBuilder()
          .setCustomId(applyPlaceholders(part.customId, vars))
          .setPlaceholder(applyPlaceholders(part.placeholder ?? 'Select…', vars));
        for (const opt of part.options) {
          const o = new StringSelectMenuOptionBuilder()
            .setLabel(applyPlaceholders(opt.label, vars))
            .setValue(applyPlaceholders(opt.value, vars));
          if (opt.description) {
            o.setDescription(applyPlaceholders(opt.description, vars).slice(0, 100));
          }
          select.addOptions(o);
        }
        container.addActionRowComponents(
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
        );
        break;
      }
      case 'channel_select': {
        const types = (part.channelTypes ?? ['text']).map((t) => CHANNEL_TYPE_MAP[t]);
        const select = new ChannelSelectMenuBuilder()
          .setCustomId(applyPlaceholders(part.customId, vars))
          .setPlaceholder(applyPlaceholders(part.placeholder ?? 'Select a channel…', vars))
          .setMinValues(1)
          .setMaxValues(1)
          .setChannelTypes(...types);
        container.addActionRowComponents(
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select),
        );
        break;
      }
      case 'role_select': {
        const select = new RoleSelectMenuBuilder()
          .setCustomId(applyPlaceholders(part.customId, vars))
          .setPlaceholder(applyPlaceholders(part.placeholder ?? 'Select a role…', vars))
          .setMinValues(1)
          .setMaxValues(1);
        container.addActionRowComponents(
          new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select),
        );
        break;
      }
      case 'buttons': {
        const buttons: ButtonBuilder[] = [];
        for (const b of part.buttons) {
          if (b.when && !truthy(vars[b.when])) continue;
          if (b.whenNot && truthy(vars[b.whenNot])) continue;
          const style = STYLE_MAP[b.style] ?? ButtonStyle.Secondary;
          const btn = new ButtonBuilder()
            .setLabel(applyPlaceholders(b.label, vars))
            .setStyle(style);
          if (style === ButtonStyle.Link) {
            const url = applyPlaceholders(b.url ?? '', vars);
            if (!url) continue;
            btn.setURL(url);
          } else {
            btn.setCustomId(applyPlaceholders(b.customId ?? 'button', vars));
          }
          buttons.push(btn);
        }
        if (buttons.length) {
          container.addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
          );
        }
        break;
      }
      default:
        break;
    }
  }

  return container;
}

export function buildNamedContainer(
  name: string,
  vars: Record<string, string> = {},
): ContainerBuilder {
  return buildContainerFromDef(loadContainerDef(name), vars);
}
