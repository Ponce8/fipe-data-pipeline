export interface ReferenceTable {
  Codigo: number;
  Mes: string;
}

export interface Brand {
  Label: string;
  Value: string;
}

export interface Model {
  Label: string;
  Value: number;
}

export interface ModelsResponse {
  Modelos: Model[];
  Anos?: Year[];
}

export interface Year {
  Label: string;
  Value: string; // format: "2020-1" (year-fuelCode)
}

export interface Price {
  Valor: string;
  Marca: string;
  Modelo: string;
  AnoModelo: number;
  Combustivel: string;
  CodigoFipe: string;
  MesReferencia: string;
  Autenticacao: string;
  TipoVeiculo: number;
  SiglaCombustivel: string;
  DataConsulta: string;
}

export interface FipeError {
  codigo: string;
  erro: string;
}

export interface PriceParams {
  referenceCode: number;
  brandCode: string;
  modelCode: string;
  year: string;
  fuelCode: number;
}
