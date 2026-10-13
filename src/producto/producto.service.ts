import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, In, Between, Like, ILike } from 'typeorm';
import { Producto, TipoProducto, EstadoProducto } from './entities/producto.entity.js';
import { ProductoVariante } from './entities/producto-variante.entity.js';
import { Categoria } from './entities/categoria.entity.js';
import { Coleccion } from './entities/coleccion.entity.js';
import { MovimientoInventario, TipoMovimiento, OrigenMovimiento } from './entities/movimiento-inventario.entity.js';
import { Empresa } from '../empresa/entities/empresa.entity.js';
import {
  CrearProductoDto,
  ActualizarProductoDto,
  FiltroProductoDto,
  AjusteStockDto,
  MovimientoStockDto,
} from './dto/producto.dto.js';
import {
  CrearVarianteDto,
  ActualizarVarianteDto,
  AjusteStockVarianteDto,
  GenerarVariantesDto,
} from './dto/variante.dto.js';
import {
  CrearCategoriaDto,
  ActualizarCategoriaDto,
  CrearColeccionDto,
  ActualizarColeccionDto,
  AgregarProductoColeccionDto,
  RemoverProductoColeccionDto,
} from './dto/categoria-coleccion.dto.js';
import {
  CrearMovimientoInventarioDto,
  FiltroMovimientoInventarioDto,
  ResumenInventarioDto,
  MovimientoMasivoDto,
} from './dto/inventario.dto.js';

@Injectable()
export class ProductoService {
  private readonly logger = new Logger(ProductoService.name);

  constructor(
    @InjectRepository(Producto)
    private readonly productoRepository: Repository<Producto>,
    @InjectRepository(ProductoVariante)
    private readonly varianteRepository: Repository<ProductoVariante>,
    @InjectRepository(Categoria)
    private readonly categoriaRepository: Repository<Categoria>,
    @InjectRepository(Coleccion)
    private readonly coleccionRepository: Repository<Coleccion>,
    @InjectRepository(MovimientoInventario)
    private readonly movimientoRepository: Repository<MovimientoInventario>,
    @InjectRepository(Empresa)
    private readonly empresaRepository: Repository<Empresa>,
  ) {}

  // ==================== PRODUCTOS ====================

  async crear(empresaId: string, dto: CrearProductoDto): Promise<Producto> {
    // Verificar SKU único
    const existeSku = await this.productoRepository.findOne({
      where: { empresaId, sku: dto.sku },
    });
    if (existeSku) {
      throw new ConflictException(`Ya existe un producto con SKU ${dto.sku}`);
    }

    // Verificar código de barras si se proporciona
    if (dto.codigoBarras) {
      const existeCb = await this.productoRepository.findOne({
        where: { empresaId, codigoBarras: dto.codigoBarras },
      });
      if (existeCb) {
        throw new ConflictException(`Ya existe un producto con ese código de barras`);
      }
    }

    // Validar categoría si se proporciona
    if (dto.categoriaId) {
      const categoria = await this.categoriaRepository.findOne({
        where: { id: dto.categoriaId, empresaId },
      });
      if (!categoria) {
        throw new NotFoundException('Categoría no encontrada');
      }
    }

    // Validar colecciones si se proporcionan
    let colecciones: Coleccion[] = [];
    if (dto.coleccionIds?.length) {
      colecciones = await this.coleccionRepository.find({
        where: { id: In(dto.coleccionIds), empresaId },
      });
      if (colecciones.length !== dto.coleccionIds.length) {
        throw new NotFoundException('Una o más colecciones no encontradas');
      }
    }

    // Generar slug si no se proporciona
    let slug = dto.slug;
    if (!slug && dto.nombre) {
      slug = this.generarSlug(dto.nombre);
      // Verificar unicidad
      const existeSlug = await this.productoRepository.findOne({
        where: { empresaId, slug },
      });
      if (existeSlug) {
        slug = `${slug}-${Date.now()}`;
      }
    }

    const producto = this.productoRepository.create({
      ...dto,
      empresaId,
      slug,
      colecciones,
    });

    const guardado = await this.productoRepository.save(producto) as unknown as Producto;
    this.logger.log(`Producto creado: ${guardado.nombre} (${guardado.sku})`);

    // Movimiento de inventario inicial si hay stock
    if (guardado.rastrearInventario && guardado.stock > 0 && !guardado.requiereVariantes) {
      await this.registrarMovimiento({
        empresaId,
        productoId: guardado.id,
        tipo: TipoMovimiento.INVENTARIO_INICIAL,
        origen: OrigenMovimiento.SISTEMA,
        cantidad: guardado.stock,
        stockAnterior: 0,
        stockPosterior: guardado.stock,
        notas: 'Inventario inicial al crear producto',
      });
    }

    return this.buscarPorId(guardado.id, empresaId);
  }

  async buscarPorId(id: string, empresaId: string): Promise<Producto> {
    const producto = await this.productoRepository.findOne({
      where: { id, empresaId },
      relations: { categoria: true, colecciones: true, variantes: true },
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }
    return producto;
  }

  async buscarPorSku(sku: string, empresaId: string): Promise<Producto | null> {
    return this.productoRepository.findOne({
      where: { sku, empresaId },
      relations: { categoria: true, colecciones: true, variantes: true },
    });
  }

  async listar(empresaId: string, filtro: any = {}): Promise<{ data: Producto[]; total: number }> {
    const query = this.productoRepository.createQueryBuilder('producto')
      .leftJoinAndSelect('producto.categoria', 'categoria')
      .leftJoinAndSelect('producto.colecciones', 'colecciones')
      .where('producto.empresaId = :empresaId', { empresaId });

    if (filtro.busqueda) {
      query.andWhere(
        '(producto.nombre ILIKE :busqueda OR producto.sku ILIKE :busqueda OR producto.codigoBarras ILIKE :busqueda)',
        { busqueda: `%${filtro.busqueda}%` },
      );
    }

    if (filtro.estado) {
      query.andWhere('producto.estado = :estado', { estado: filtro.estado });
    }

    if (filtro.tipo) {
      query.andWhere('producto.tipo = :tipo', { tipo: filtro.tipo });
    }

    if (filtro.categoriaId) {
      query.andWhere('producto.categoriaId = :categoriaId', { categoriaId: filtro.categoriaId });
    }

    if (filtro.coleccionId) {
      query.andWhere(':coleccionId IN (SELECT id FROM producto_colecciones WHERE productoId = producto.id)', {
        coleccionId: filtro.coleccionId,
      });
    }

    if (filtro.stockBajo) {
      query.andWhere('producto.rastrearInventario = true')
        .andWhere('producto.requiereVariantes = false')
        .andWhere('producto.stock <= producto.stockMinimo');
    }

    if (filtro.sinStock) {
      query.andWhere('producto.rastrearInventario = true')
        .andWhere('producto.requiereVariantes = false')
        .andWhere('producto.stock <= 0');
    }

    if (filtro.precioMin !== undefined) {
      query.andWhere('producto.precio >= :precioMin', { precioMin: filtro.precioMin });
    }

    if (filtro.precioMax !== undefined) {
      query.andWhere('producto.precio <= :precioMax', { precioMax: filtro.precioMax });
    }

    if (filtro.proveedor) {
      query.andWhere('producto.proveedor ILIKE :proveedor', { proveedor: `%${filtro.proveedor}%` });
    }

    if (filtro.marca) {
      query.andWhere('producto.marca ILIKE :marca', { marca: `%${filtro.marca}%` });
    }

    const pagina = filtro.pagina || 1;
    const limite = filtro.limite || 20;
    const ordenarPor = filtro.ordenarPor || 'creadoEn';
    const orden = filtro.orden || 'DESC';

    query.orderBy(`producto.${ordenarPor}`, orden);
    query.skip((pagina - 1) * limite).take(limite);

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  async actualizar(id: string, empresaId: string, dto: any): Promise<Producto> {
    const producto = await this.buscarPorId(id, empresaId);

    // Verificar SKU único si cambia
    if (dto.sku && dto.sku !== producto.sku) {
      const existe = await this.productoRepository.findOne({
        where: { empresaId, sku: dto.sku },
      });
      if (existe) {
        throw new ConflictException(`Ya existe un producto con SKU ${dto.sku}`);
      }
    }

    // Verificar código de barras si cambia
    if (dto.codigoBarras && dto.codigoBarras !== producto.codigoBarras) {
      const existe = await this.productoRepository.findOne({
        where: { empresaId, codigoBarras: dto.codigoBarras },
      });
      if (existe) {
        throw new ConflictException('Ya existe un producto con ese código de barras');
      }
    }

    // Validar categoría si se proporciona
    if (dto.categoriaId) {
      const categoria = await this.categoriaRepository.findOne({
        where: { id: dto.categoriaId, empresaId },
      });
      if (!categoria) {
        throw new NotFoundException('Categoría no encontrada');
      }
    }

    // Actualizar colecciones si se proporcionan
    if (dto.coleccionIds) {
      const colecciones = await this.coleccionRepository.find({
        where: { id: In(dto.coleccionIds), empresaId },
      });
      if (colecciones.length !== dto.coleccionIds.length) {
        throw new NotFoundException('Una o más colecciones no encontradas');
      }
      producto.colecciones = colecciones;
    }

    // Generar slug si cambia nombre
    if (dto.nombre && dto.nombre !== producto.nombre && !dto.slug) {
      let slug = this.generarSlug(dto.nombre);
      const existeSlug = await this.productoRepository.findOne({
        where: { empresaId, slug },
      });
      if (existeSlug) {
        slug = `${slug}-${Date.now()}`;
      }
      dto.slug = slug;
    }

    Object.assign(producto, dto);
    const actualizado = await this.productoRepository.save(producto) as unknown as Producto;
    this.logger.log(`Producto actualizado: ${actualizado.nombre} (${actualizado.sku})`);
    return this.buscarPorId(actualizado.id, empresaId);
  }

  async ajustarStock(id: string, empresaId: string, dto: AjusteStockDto): Promise<Producto> {
    const producto = await this.buscarPorId(id, empresaId);

    if (producto.requiereVariantes) {
      throw new BadRequestException('No se puede ajustar stock directamente en productos con variantes. Use las variantes.');
    }

    if (!producto.rastrearInventario) {
      throw new BadRequestException('El producto no tiene rastreo de inventario habilitado');
    }

    const stockAnterior = producto.stock;
    const stockNuevo = dto.stock;
    const diferencia = stockNuevo - stockAnterior;

    if (diferencia === 0) {
      return producto;
    }

    producto.stock = stockNuevo;
    await this.productoRepository.save(producto);

    await this.registrarMovimiento({
      empresaId,
      productoId: producto.id,
      tipo: diferencia > 0 ? TipoMovimiento.ENTRADA : TipoMovimiento.SALIDA,
      origen: OrigenMovimiento.AJUSTE_INVENTARIO,
      cantidad: diferencia,
      stockAnterior,
      stockPosterior: stockNuevo,
      notas: dto.motivo || 'Ajuste manual de stock',
    });

    this.logger.log(`Stock ajustado: ${producto.sku} de ${stockAnterior} a ${stockNuevo}`);
    return this.buscarPorId(id, empresaId);
  }

  async moverStock(id: string, empresaId: string, dto: MovimientoStockDto): Promise<Producto> {
    const producto = await this.buscarPorId(id, empresaId);

    if (producto.requiereVariantes) {
      throw new BadRequestException('Use las variantes para mover stock');
    }

    if (!producto.rastrearInventario) {
      throw new BadRequestException('El producto no tiene rastreo de inventario habilitado');
    }

    const stockAnterior = producto.stock;
    const stockNuevo = stockAnterior + dto.cantidad;

    if (stockNuevo < 0 && !producto.permitirBackorder) {
      throw new BadRequestException('Stock insuficiente');
    }

    producto.stock = stockNuevo;
    await this.productoRepository.save(producto);

    await this.registrarMovimiento({
      empresaId,
      productoId: producto.id,
      tipo: dto.tipo === 'entrada' ? TipoMovimiento.ENTRADA : 
            dto.tipo === 'salida' ? TipoMovimiento.SALIDA :
            dto.tipo === 'ajuste' ? TipoMovimiento.AJUSTE :
            dto.tipo === 'transferencia' ? TipoMovimiento.TRANSFERENCIA :
            dto.tipo === 'devolucion' ? TipoMovimiento.DEVOLUCION :
            dto.tipo === 'merma' ? TipoMovimiento.MERMA :
            dto.tipo === 'inventario_inicial' ? TipoMovimiento.INVENTARIO_INICIAL :
            TipoMovimiento.AJUSTE,
      origen: dto.tipo === 'entrada' ? OrigenMovimiento.COMPRA :
              dto.tipo === 'salida' ? OrigenMovimiento.VENTA :
              OrigenMovimiento.AJUSTE_INVENTARIO,
      cantidad: dto.cantidad,
      stockAnterior,
      stockPosterior: stockNuevo,
      documentoOrigenId: dto.documentoOrigenId,
      tipoDocumentoOrigen: dto.tipoDocumentoOrigen,
      costoUnitario: dto.costoUnitario,
      ubicacionOrigen: dto.ubicacionOrigen,
      ubicacionDestino: dto.ubicacionDestino,
      notas: dto.motivo,
    });

    this.logger.log(`Stock movido: ${producto.sku} ${dto.cantidad > 0 ? '+' : ''}${dto.cantidad}`);
    return this.buscarPorId(id, empresaId);
  }

  async eliminar(id: string, empresaId: string): Promise<void> {
    const producto = await this.buscarPorId(id, empresaId);
    await this.productoRepository.softRemove(producto);
    this.logger.log(`Producto eliminado: ${producto.nombre} (${producto.sku})`);
  }

  // ==================== VARIANTES ====================

  async crearVariante(productoId: string, empresaId: string, dto: CrearVarianteDto): Promise<ProductoVariante> {
    const producto = await this.buscarPorId(productoId, empresaId);

    // Verificar SKU único
    const existeSku = await this.varianteRepository.findOne({
      where: { productoId, sku: dto.sku },
    });
    if (existeSku) {
      throw new ConflictException(`Ya existe una variante con SKU ${dto.sku}`);
    }

    // Verificar código de barras
    if (dto.codigoBarras) {
      const existeCb = await this.varianteRepository.findOne({
        where: { productoId, codigoBarras: dto.codigoBarras },
      });
      if (existeCb) {
        throw new ConflictException('Ya existe una variante con ese código de barras');
      }
    }

    // Verificar unicidad de opciones
    const existeOpciones = await this.varianteRepository.findOne({
      where: { productoId, opciones: dto.opciones },
    });
    if (existeOpciones) {
      throw new ConflictException('Ya existe una variante con esas opciones');
    }

    const variante = this.varianteRepository.create({
      ...dto,
      productoId,
      producto,
    });

    const guardada = await this.varianteRepository.save(variante);
    this.logger.log(`Variante creada: ${guardada.nombreCompleto} (${guardada.sku})`);

    // Movimiento inicial
    if (guardada.rastrearInventario && guardada.stock > 0) {
      await this.registrarMovimiento({
        empresaId,
        productoId: producto.id,
        varianteId: guardada.id,
        tipo: TipoMovimiento.INVENTARIO_INICIAL,
        origen: OrigenMovimiento.SISTEMA,
        cantidad: guardada.stock,
        stockAnterior: 0,
        stockPosterior: guardada.stock,
        notas: 'Inventario inicial al crear variante',
      });
    }

    return guardada;
  }

  async actualizarVariante(varianteId: string, empresaId: string, dto: ActualizarVarianteDto): Promise<ProductoVariante> {
    const variante = await this.varianteRepository.findOne({
      where: { id: varianteId },
      relations: { producto: true },
    });

    if (!variante || variante.producto.empresaId !== empresaId) {
      throw new NotFoundException('Variante no encontrada');
    }

    if (dto.sku && dto.sku !== variante.sku) {
      const existe = await this.varianteRepository.findOne({
        where: { productoId: variante.productoId, sku: dto.sku },
      });
      if (existe) {
        throw new ConflictException(`Ya existe una variante con SKU ${dto.sku}`);
      }
    }

    if (dto.codigoBarras && dto.codigoBarras !== variante.codigoBarras) {
      const existe = await this.varianteRepository.findOne({
        where: { productoId: variante.productoId, codigoBarras: dto.codigoBarras },
      });
      if (existe) {
        throw new ConflictException('Ya existe una variante con ese código de barras');
      }
    }

    if (dto.opciones) {
      const existeOpciones = await this.varianteRepository.findOne({
        where: { productoId: variante.productoId, opciones: dto.opciones },
      });
      if (existeOpciones && existeOpciones.id !== varianteId) {
        throw new ConflictException('Ya existe una variante con esas opciones');
      }
    }

    Object.assign(variante, dto);
    const actualizada = await this.varianteRepository.save(variante);
    this.logger.log(`Variante actualizada: ${actualizada.nombreCompleto} (${actualizada.sku})`);
    return actualizada;
  }

  async ajustarStockVariante(varianteId: string, empresaId: string, dto: AjusteStockVarianteDto): Promise<ProductoVariante> {
    const variante = await this.varianteRepository.findOne({
      where: { id: varianteId },
      relations: { producto: true },
    });

    if (!variante || variante.producto.empresaId !== empresaId) {
      throw new NotFoundException('Variante no encontrada');
    }

    if (!variante.rastrearInventario) {
      throw new BadRequestException('La variante no tiene rastreo de inventario habilitado');
    }

    const stockAnterior = variante.stock;
    const stockNuevo = dto.stock;
    const diferencia = stockNuevo - stockAnterior;

    if (diferencia === 0) {
      return variante;
    }

    variante.stock = stockNuevo;
    await this.varianteRepository.save(variante);

    await this.registrarMovimiento({
      empresaId,
      productoId: variante.productoId,
      varianteId: variante.id,
      tipo: diferencia > 0 ? TipoMovimiento.ENTRADA : TipoMovimiento.SALIDA,
      origen: OrigenMovimiento.AJUSTE_INVENTARIO,
      cantidad: diferencia,
      stockAnterior,
      stockPosterior: stockNuevo,
      notas: dto.motivo || 'Ajuste manual de stock en variante',
    });

    this.logger.log(`Stock variante ajustado: ${variante.sku} de ${stockAnterior} a ${stockNuevo}`);
    const actualizada = await this.varianteRepository.findOne({
      where: { id: varianteId },
      relations: { producto: true },
    });
    if (!actualizada) {
      throw new NotFoundException('Variante no encontrada después de actualizar');
    }
    return actualizada;
  }
  

  async generarVariantes(productoId: string, empresaId: string, dto: GenerarVariantesDto): Promise<ProductoVariante[]> {
    const producto = await this.buscarPorId(productoId, empresaId);

    const claves = Object.keys(dto.opciones);
    const valores = Object.values(dto.opciones);

    if (claves.length < 1 || valores.some(v => v.length === 0)) {
      throw new BadRequestException('Debe proporcionar al menos una opción con valores');
    }

    // Generar todas las combinaciones
    const combinaciones = this.generarCombinaciones(valores).map(combo => {
      const opciones: Record<string, string> = {};
      claves.forEach((clave, i) => {
        opciones[clave] = combo[i];
      });
      return opciones;
    });

    const variantes: ProductoVariante[] = [];

    for (const opciones of combinaciones) {
      // Verificar si ya existe
      const existe = await this.varianteRepository.findOne({
        where: { productoId, opciones },
      });
      if (existe) continue;

      const sufijo = Object.values(opciones).join('-');
      const sku = dto.prefijoSku ? `${dto.prefijoSku}-${sufijo}` : `${producto.sku}-${sufijo}`;

      // Verificar SKU único
      let skuFinal = sku;
      let contador = 1;
      while (await this.varianteRepository.findOne({ where: { productoId, sku: skuFinal } })) {
        skuFinal = `${sku}-${contador++}`;
      }

      const variante = this.varianteRepository.create({
        sku: skuFinal,
        opciones,
        precio: dto.precioBase ?? producto.precio,
        costo: dto.costoBase ?? producto.costo,
        stock: dto.stockBase ?? 0,
        rastrearInventario: true,
        activo: true,
        productoId,
        producto,
      });

      const guardada = await this.varianteRepository.save(variante);
      variantes.push(guardada);
    }

    if (variantes.length > 0) {
      producto.requiereVariantes = true;
      await this.productoRepository.save(producto);
    }

    this.logger.log(`Generadas ${variantes.length} variantes para ${producto.nombre}`);
    return variantes;
  }

  async eliminarVariante(varianteId: string, empresaId: string): Promise<void> {
    const variante = await this.varianteRepository.findOne({
      where: { id: varianteId },
      relations: { producto: true },
    });

    if (!variante || variante.producto.empresaId !== empresaId) {
      throw new NotFoundException('Variante no encontrada');
    }

    await this.varianteRepository.softRemove(variante);
    this.logger.log(`Variante eliminada: ${variante.nombreCompleto} (${variante.sku})`);
  }

  // ==================== MOVIMIENTOS INVENTARIO ====================

  async registrarMovimiento(data: {
    empresaId: string;
    productoId: string;
    varianteId?: string;
    tipo: TipoMovimiento;
    origen?: OrigenMovimiento;
    cantidad: number;
    stockAnterior: number;
    stockPosterior: number;
    documentoOrigenId?: string;
    tipoDocumentoOrigen?: string;
    costoUnitario?: number;
    costoTotal?: number;
    ubicacionOrigen?: string;
    ubicacionDestino?: string;
    usuarioId?: string;
    notas?: string;
    metadatos?: Record<string, any>;
  }): Promise<MovimientoInventario> {
    return this.registrarMovimientoCon(this.movimientoRepository.manager, data);
  }

  /**
   * Registra el movimiento de inventario usando el EntityManager que le pase
   * el llamador, para que quede dentro de la misma transacción (ej: la compra
   * que también genera el asiento y descuenta la caja).
   */
  private async registrarMovimientoCon(
    manager: EntityManager,
    data: {
      empresaId: string;
      productoId: string;
      varianteId?: string;
      tipo: TipoMovimiento;
      origen?: OrigenMovimiento;
      cantidad: number;
      stockAnterior: number;
      stockPosterior: number;
      documentoOrigenId?: string;
      tipoDocumentoOrigen?: string;
      costoUnitario?: number;
      costoTotal?: number;
      ubicacionOrigen?: string;
      ubicacionDestino?: string;
      usuarioId?: string;
      notas?: string;
      metadatos?: Record<string, any>;
    },
  ): Promise<MovimientoInventario> {
    const numeroReferencia = `MOV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const movimiento = manager.create(MovimientoInventario, {
      numeroReferencia,
      ...data,
    });

    return manager.save(movimiento);
  }

  /**
   * Aplica la recepción de una compra al inventario DENTRO de la transacción
   * de la compra (recibe el EntityManager):
   *  - sube stock (producto simple o variante),
   *  - actualiza el costo con política de "último costo",
   *  - registra el movimiento con origen COMPRA y el id de la compra.
   *
   * Las líneas sin producto/variante (ej: flete) no tocan inventario.
   */
  async aplicarEntradaCompra(
    manager: EntityManager,
    empresaId: string,
    compraId: string,
    lineas: Array<{
      productoId?: string | null;
      varianteId?: string | null;
      cantidad: number;
      costoUnitario: number;
      descripcion: string;
    }>,
  ): Promise<void> {
    for (const linea of lineas) {
      if (linea.varianteId) {
        await this.recibirCompraEnVariante(manager, empresaId, compraId, linea);
      } else if (linea.productoId) {
        await this.recibirCompraEnProducto(manager, empresaId, compraId, linea);
      }
    }
  }

  /**
   * Revierte una entrada por compra (anulación de compra): baja el stock y
   * registra una salida con origen DEVOLUCION_PROVEEDOR. El costo NO se toca
   * porque es el último precio efectivamente pagado.
   */
  async reversarEntradaCompra(
    manager: EntityManager,
    empresaId: string,
    compraId: string,
    lineas: Array<{
      productoId?: string | null;
      varianteId?: string | null;
      cantidad: number;
      costoUnitario: number;
      descripcion: string;
    }>,
  ): Promise<void> {
    for (const linea of lineas) {
      if (linea.varianteId) {
        const variante = await manager.findOne(ProductoVariante, {
          // La variante no tiene empresa propia: se valida a través de su producto.
          where: { id: linea.varianteId, producto: { empresaId } },
        });
        if (!variante) {
          throw new NotFoundException(`Variante ${linea.varianteId} no encontrada en este negocio`);
        }
        const stockAnterior = variante.stock;
        const stockPosterior = stockAnterior - linea.cantidad;
        variante.stock = stockPosterior;
        await manager.save(variante);
        await this.sincronizarStockDeProducto(variante.productoId, manager);
        await this.registrarMovimientoCon(manager, {
          empresaId,
          productoId: variante.productoId,
          varianteId: variante.id,
          tipo: TipoMovimiento.SALIDA,
          origen: OrigenMovimiento.DEVOLUCION_PROVEEDOR,
          cantidad: linea.cantidad,
          stockAnterior,
          stockPosterior,
          documentoOrigenId: compraId,
          tipoDocumentoOrigen: 'compra',
          notas: 'Anulación de compra',
        });
      } else if (linea.productoId) {
        const producto = await manager.findOne(Producto, {
          where: { id: linea.productoId, empresaId },
        });
        if (!producto) {
          throw new NotFoundException(`Producto ${linea.productoId} no encontrado en este negocio`);
        }
        if (!producto.rastrearInventario) {
          continue;
        }
        const stockAnterior = producto.stock;
        const stockPosterior = stockAnterior - linea.cantidad;
        producto.stock = stockPosterior;
        await manager.save(producto);
        await this.registrarMovimientoCon(manager, {
          empresaId,
          productoId: producto.id,
          tipo: TipoMovimiento.SALIDA,
          origen: OrigenMovimiento.DEVOLUCION_PROVEEDOR,
          cantidad: linea.cantidad,
          stockAnterior,
          stockPosterior,
          documentoOrigenId: compraId,
          tipoDocumentoOrigen: 'compra',
          notas: 'Anulación de compra',
        });
      }
    }
  }

  private async recibirCompraEnProducto(
    manager: EntityManager,
    empresaId: string,
    compraId: string,
    linea: {
      productoId?: string | null;
      varianteId?: string | null;
      cantidad: number;
      costoUnitario: number;
      descripcion: string;
    },
  ): Promise<void> {
    const producto = await manager.findOne(Producto, {
      where: { id: linea.productoId!, empresaId },
    });
    if (!producto) {
      throw new NotFoundException(`Producto ${linea.productoId} no encontrado en este negocio`);
    }
    // Productos sin rastreo de inventario (servicios, digitales) no mueven stock.
    if (!producto.rastrearInventario) {
      this.logger.warn(
        `Producto ${producto.sku} no rastrea inventario: la línea "${linea.descripcion}" no genera movimiento`,
      );
      return;
    }
    if (producto.requiereVariantes) {
      throw new BadRequestException(
        `El producto ${producto.sku} usa variantes; la línea de compra debe indicar varianteId`,
      );
    }

    const stockAnterior = producto.stock;
    const stockPosterior = stockAnterior + linea.cantidad;
    producto.stock = stockPosterior;
    producto.costo = linea.costoUnitario; // política de último costo
    await manager.save(producto);

    await this.registrarMovimientoCon(manager, {
      empresaId,
      productoId: producto.id,
      tipo: TipoMovimiento.ENTRADA,
      origen: OrigenMovimiento.COMPRA,
      cantidad: linea.cantidad,
      stockAnterior,
      stockPosterior,
      documentoOrigenId: compraId,
      tipoDocumentoOrigen: 'compra',
      costoUnitario: linea.costoUnitario,
      costoTotal: Math.round(linea.cantidad * linea.costoUnitario * 100) / 100,
      notas: `Recepción de compra: ${linea.descripcion}`,
    });
  }

  private async recibirCompraEnVariante(
    manager: EntityManager,
    empresaId: string,
    compraId: string,
    linea: {
      productoId?: string | null;
      varianteId?: string | null;
      cantidad: number;
      costoUnitario: number;
      descripcion: string;
    },
  ): Promise<void> {
    const variante = await manager.findOne(ProductoVariante, {
      // La variante no tiene empresa propia: se valida a través de su producto.
      where: { id: linea.varianteId!, producto: { empresaId } },
    });
    if (!variante) {
      throw new NotFoundException(`Variante ${linea.varianteId} no encontrada en este negocio`);
    }

    const stockAnterior = variante.stock;
    const stockPosterior = stockAnterior + linea.cantidad;
    variante.stock = stockPosterior;
    variante.costo = linea.costoUnitario; // política de último costo
    await manager.save(variante);
    await this.sincronizarStockDeProducto(variante.productoId, manager);

    await this.registrarMovimientoCon(manager, {
      empresaId,
      productoId: variante.productoId,
      varianteId: variante.id,
      tipo: TipoMovimiento.ENTRADA,
      origen: OrigenMovimiento.COMPRA,
      cantidad: linea.cantidad,
      stockAnterior,
      stockPosterior,
      documentoOrigenId: compraId,
      tipoDocumentoOrigen: 'compra',
      costoUnitario: linea.costoUnitario,
      costoTotal: Math.round(linea.cantidad * linea.costoUnitario * 100) / 100,
      notas: `Recepción de compra: ${linea.descripcion}`,
    });
  }

  /** El stock del producto padre con variantes es la suma de sus variantes. */
  private async sincronizarStockDeProducto(productoId: string, manager: EntityManager): Promise<void> {
    const resultado = await manager
      .createQueryBuilder(ProductoVariante, 'variante')
      .select('COALESCE(SUM(variante.stock), 0)', 'suma')
      .where('variante.productoId = :productoId', { productoId })
      .getRawOne<{ suma: string }>();
    await manager.update(Producto, productoId, { stock: Number(resultado?.suma ?? 0) });
  }

  async obtenerMovimientos(empresaId: string, filtro: any = {}): Promise<{ data: MovimientoInventario[]; total: number }> {
    const query = this.movimientoRepository.createQueryBuilder('mov')
      .leftJoinAndSelect('mov.producto', 'producto')
      .leftJoinAndSelect('mov.variante', 'variante')
      .where('mov.empresaId = :empresaId', { empresaId });

    if (filtro.productoId) {
      query.andWhere('mov.productoId = :productoId', { productoId: filtro.productoId });
    }

    if (filtro.varianteId) {
      query.andWhere('mov.varianteId = :varianteId', { varianteId: filtro.varianteId });
    }

    if (filtro.tipo) {
      query.andWhere('mov.tipo = :tipo', { tipo: filtro.tipo });
    }

    if (filtro.origen) {
      query.andWhere('mov.origen = :origen', { origen: filtro.origen });
    }

    if (filtro.documentoOrigenId) {
      query.andWhere('mov.documentoOrigenId = :documentoOrigenId', { documentoOrigenId: filtro.documentoOrigenId });
    }

    if (filtro.fechaDesde) {
      query.andWhere('mov.creadoEn >= :fechaDesde', { fechaDesde: filtro.fechaDesde });
    }

    if (filtro.fechaHasta) {
      query.andWhere('mov.creadoEn <= :fechaHasta', { fechaHasta: filtro.fechaHasta });
    }

    const pagina = filtro.pagina || 1;
    const limite = filtro.limite || 20;
    const ordenarPor = filtro.ordenarPor || 'creadoEn';
    const orden = filtro.orden || 'DESC';

    query.orderBy(`mov.${ordenarPor}`, orden);
    query.skip((pagina - 1) * limite).take(limite);

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  async obtenerResumenInventario(empresaId: string, filtro: any = {}): Promise<any> {
    const query = this.productoRepository.createQueryBuilder('p')
      .where('p.empresaId = :empresaId', { empresaId });

    if (filtro.categoriaId) {
      query.andWhere('p.categoriaId = :categoriaId', { categoriaId: filtro.categoriaId });
    }

    if (filtro.soloStockBajo) {
      query.andWhere('p.rastrearInventario = true')
        .andWhere('p.requiereVariantes = false')
        .andWhere('p.stock <= p.stockMinimo');
    }

    if (filtro.soloSinStock) {
      query.andWhere('p.rastrearInventario = true')
        .andWhere('p.requiereVariantes = false')
        .andWhere('p.stock <= 0');
    }

    const total = await query.getCount();

    const productos = await query
      .leftJoinAndSelect('p.categoria', 'categoria')
      .skip((filtro.pagina - 1) * filtro.limite)
      .take(filtro.limite)
      .getMany();

    // Obtener stock de variantes para productos que las requieren
    for (const p of productos) {
      if (p.requiereVariantes) {
        const variantes = await this.varianteRepository.find({
          where: { productoId: p.id },
        });
        p.variantes = variantes;
      }
    }

    return {
      total,
      productos,
    };
  }

  // ==================== UTILIDADES ====================

  private generarSlug(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  private generarCombinaciones(arrays: string[][]): string[][] {
    if (arrays.length === 0) return [[]];
    if (arrays.length === 1) return arrays[0].map(v => [v]);

    const [primero, ...resto] = arrays;
    const combinacionesResto = this.generarCombinaciones(resto);

    return primero.flatMap(v =>
      combinacionesResto.map(r => [v, ...r])
    );
  }
}
