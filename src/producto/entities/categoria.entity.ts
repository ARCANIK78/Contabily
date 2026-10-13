import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Empresa } from '../../empresa/entities/empresa.entity.js';
import { Producto } from './producto.entity.js';
@Entity('categorias')
@Unique(['empresaId', 'slug'])
@Index(['empresaId', 'padreId'])
export class Categoria {
  @ApiProperty({ description: 'Identificador único', example: 'uuid-v4' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Nombre de la categoría', example: 'Ropa' })
  @Column({ type: 'varchar', length: 255 })
  nombre: string;

  @ApiPropertyOptional({ description: 'Descripción' })
  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @ApiPropertyOptional({ description: 'Slug URL', example: 'ropa' })
  @Column({ type: 'varchar', length: 255 })
  slug: string;

  @ApiPropertyOptional({ description: 'Imagen de la categoría' })
  @Column({ type: 'text', nullable: true })
  imagen: string | null;

  @ApiPropertyOptional({ description: 'Icono (clase CSS o nombre)', example: 'fa-shirt' })
  @Column({ type: 'varchar', length: 100, nullable: true })
  icono: string | null;

  @ApiPropertyOptional({ description: 'Color hex para UI', example: '#3B82F6' })
  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @ApiProperty({ description: 'Orden de visualización', default: 0 })
  @Column({ type: 'int', default: 0 })
  orden: number;

  @ApiProperty({ description: 'Si la categoría está activa', default: true })
  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @ApiPropertyOptional({ description: 'Visible en menú/navegación', default: true })
  @Column({ type: 'boolean', default: true })
  visibleEnMenu: boolean;

  @ApiPropertyOptional({ description: 'Título SEO' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  tituloSeo: string | null;

  @ApiPropertyOptional({ description: 'Descripción SEO' })
  @Column({ type: 'varchar', length: 500, nullable: true })
  descripcionSeo: string | null;

  @ApiPropertyOptional({ description: 'Configuración JSON flexible' })
  @Column({ type: 'jsonb', nullable: true })
  configuracion: Record<string, any> | null;

  // Relaciones
  @ApiProperty({ description: 'ID de la empresa' })
  @Column({ type: 'uuid' })
  empresaId: string;

  @ManyToOne(() => Empresa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresaId' })
  empresa: Empresa;

  @Column({ type: 'uuid', nullable: true })
  padreId: string | null;

  @ManyToOne(() => Categoria, (categoria) => categoria.hijos, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'padreId' })
  padre: Categoria | null;

  @OneToMany(() => Categoria, (categoria) => categoria.padre)
  hijos: Categoria[];

  @OneToMany(() => Producto, (producto) => producto.categoria)
  productos: Producto[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  path: string | null;

  @ApiProperty({ description: 'Fecha de creación' })
  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creadoEn: Date;

  @ApiProperty({ description: 'Fecha de última actualización' })
  @UpdateDateColumn({ type: 'timestamptz', name: 'actualizado_en' })
  actualizadoEn: Date;

  // Métodos de conveniencia
  get nombreCompleto(): string {
    if (this.padre) {
      return `${this.padre.nombreCompleto} > ${this.nombre}`;
    }
    return this.nombre;
  }

  get nivel(): number {
    let nivel = 0;
    let actual: Categoria | null = this.padre;
    while (actual) {
      nivel++;
      actual = actual.padre;
    }
    return nivel;
  }
}