import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTelegramBotSettingsDto {
  @IsOptional()
  @IsString()
  botToken?: string;

  @IsOptional()
  @IsString()
  webAppUrl?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class TelegramReplyDto {
  @IsString()
  @MinLength(1)
  text!: string;
}
