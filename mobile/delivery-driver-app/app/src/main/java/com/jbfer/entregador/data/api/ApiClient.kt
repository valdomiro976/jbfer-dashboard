package com.jbfer.entregador.data.api

import com.jbfer.entregador.BuildConfig
import com.jbfer.entregador.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

interface ApiService {

    @POST("api/mobile/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @GET("api/mobile/tarefas")
    suspend fun minhasTarefas(): TarefasResponse

    @GET("api/mobile/tarefas/historico")
    suspend fun historicoTarefas(): TarefasResponse

    @POST("api/mobile/tarefas/{id}/atualizar")
    suspend fun atualizarTarefa(
        @Path("id") id: Int,
        @Body request: AtualizarRequest
    ): ApiResponse

    @POST("api/mobile/tarefas/{id}/coordenadas-cliente")
    suspend fun atualizarCoordenadasCliente(
        @Path("id") id: Int,
        @Body request: CoordenadasClienteRequest
    ): ApiResponse

    @POST("api/mobile/localizacao")
    suspend fun enviarLocalizacao(@Body request: LocalizacaoRequest): ApiResponse
}

object ApiClient {

    const val BASE_URL = BuildConfig.BASE_URL

    private val logging = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val httpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val builder = chain.request().newBuilder()
            val token = SessionManager.getToken()
            if (token != null) {
                builder.header("Authorization", "Bearer $token")
            }
            builder.build().let { chain.proceed(it) }
        }
        .addInterceptor(logging)
        .build()

    val api: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl("$BASE_URL/")
            .client(httpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}

object SessionManager {
    private const val PREFS_NAME = "entregador_prefs"
    private const val KEY_TOKEN = "token"
    private const val KEY_NOME = "nome"
    private const val KEY_CNPJ = "cnpj"
    private const val KEY_TELEFONE = "telefone"

    private val prefs by lazy {
        com.jbfer.entregador.App.instance.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
    }

    fun save(token: String, nome: String, cnpj: String, telefone: String = "") {
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_NOME, nome)
            .putString(KEY_CNPJ, cnpj)
            .putString(KEY_TELEFONE, telefone)
            .apply()
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)
    fun getNome(): String? = prefs.getString(KEY_NOME, null)
    fun getCnpj(): String? = prefs.getString(KEY_CNPJ, null)
    fun getTelefone(): String? = prefs.getString(KEY_TELEFONE, null)
    fun isLoggedIn(): Boolean = getToken() != null

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_NOME).remove(KEY_CNPJ).remove(KEY_TELEFONE).apply()
    }
}