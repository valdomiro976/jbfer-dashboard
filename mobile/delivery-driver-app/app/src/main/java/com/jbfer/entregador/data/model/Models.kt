package com.jbfer.entregador.data.model

import com.google.gson.annotations.SerializedName

data class LoginRequest(
    @SerializedName("cnpj") val cnpj: String,
    @SerializedName("telefone") val telefone: String,
    @SerializedName("senha") val senha: String
)

data class LoginResponse(
    @SerializedName("sucesso") val sucesso: Boolean,
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("entregador") val entregador: Entregador?,
    @SerializedName("cnpj") val cnpj: String?
)

data class Entregador(
    @SerializedName("id") val id: Int,
    @SerializedName("nome") val nome: String,
    @SerializedName("telefone") val telefone: String?
)

data class Tarefa(
    @SerializedName("id") val id: Int,
    @SerializedName("pedido_descricao") val pedidoDescricao: String?,
    @SerializedName("cliente_nome") val clienteNome: String?,
    @SerializedName("cliente_endereco") val clienteEndereco: String?,
    @SerializedName("cliente_cidade") val clienteCidade: String?,
    @SerializedName("cliente_uf") val clienteUf: String?,
    @SerializedName("cliente_cep") val clienteCep: String?,
    @SerializedName("valor_total") val valorTotal: Double?,
    @SerializedName("status") val status: String?,
    @SerializedName("criado_em") val criadoEm: String?,
    @SerializedName("cliente_lat") val clienteLat: Double?,
    @SerializedName("cliente_lng") val clienteLng: Double?,
    @SerializedName("pagamento") val pagamento: String?,
    @SerializedName("itens") val itens: String?,
    @SerializedName("quantidade") val quantidade: Int?
)

data class TarefasResponse(
    @SerializedName("sucesso") val sucesso: Boolean,
    @SerializedName("entregador") val entregador: String?,
    @SerializedName("tarefas") val tarefas: List<Tarefa>?
)

data class AtualizarRequest(
    @SerializedName("status") val status: String,
    @SerializedName("motivo") val motivo: String? = null
)

data class LocalizacaoRequest(
    @SerializedName("lat") val lat: Double,
    @SerializedName("lng") val lng: Double,
    @SerializedName("precisao") val precisao: Float?,
    @SerializedName("velocidade") val velocidade: Float?
)

data class CoordenadasClienteRequest(
    @SerializedName("lat") val lat: Double,
    @SerializedName("lng") val lng: Double
)

data class ApiResponse(
    @SerializedName("sucesso") val sucesso: Boolean,
    @SerializedName("mensagem") val mensagem: String?
)