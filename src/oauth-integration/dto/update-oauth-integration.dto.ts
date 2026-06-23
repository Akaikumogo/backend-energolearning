import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOAuthIntegrationDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mobileRedirectUri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  webRedirectUri?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  oauthScopes?: string;
}
