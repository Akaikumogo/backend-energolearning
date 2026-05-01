import { IsBoolean, IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from 'class-validator';

export class AdminCreateAudioBookDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  coverUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminUpdateAudioBookDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsUrl()
  @MaxLength(2000)
  coverUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminCreateAudioChapterDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsInt()
  @Min(0)
  orderIndex: number;
}

export class AdminUpdateAudioChapterDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class AdminCreateAudioParagraphDto {
  @IsString()
  @MaxLength(4000)
  text: string;

  @IsInt()
  @Min(0)
  orderIndex: number;

  @IsString()
  @MaxLength(2000)
  audioUrl: string;
}

export class AdminUpdateAudioParagraphDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  audioUrl?: string;
}

