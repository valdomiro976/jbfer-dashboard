package com.jbfer.entregador.data.api

import com.jbfer.entregador.BuildConfig
import com.jbfer.entregador.data.model.*
import android.util.Log
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

    @POST("api/mobile/logout")
    suspend fun logout(): ApiResponse
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
        .addInterceptor { chain ->
            val response = chain.proceed(chain.request())
            if (response.code == 401) {
                SessionManager.clear()
                try {
                    val intent = android.content.Intent(com.jbfer.entregador.App.instance, com.jbfer.entregador.ui.login.LoginActivity::class.java)
                    intent.flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
                    com.jbfer.entregador.App.instance.startActivity(intent)
                } catch (e: Exception) {
                    // ignora
                }
            }
            response
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
    private const val KEY_CNPJ = "saved_cnpj"
    private const val KEY_TELEFONE = "saved_telefone"
    private const val KEY_SENHA = "saved_senha"

    private val prefs by lazy {
        com.jbfer.entregador.App.instance.getSharedPreferences(PREFS_NAME, android.content.Context.MODE_PRIVATE)
    }

    fun save(token: String, nome: String, cnpj: String, telefone: String = "", senha: String = "") {
        prefs.edit().remove(KEY_LOGGED_OUT).apply()
        Log.d("SessionManager", "Salvando login: cnpj=$cnpj tel=$telefone senhaLen=${senha.length}")
        prefs.edit()
            .putString(KEY_TOKEN, token)
            .putString(KEY_NOME, nome)
            .putString(KEY_CNPJ, cnpj)
            .putString(KEY_TELEFONE, telefone)
            .putString(KEY_SENHA, senha)
            .apply()
        Log.d("SessionManager", "Verificacao apos save: cnpj=${prefs.getString(KEY_CNPJ, null)} tel=${prefs.getString(KEY_TELEFONE, null)} senhaLen=${prefs.getString(KEY_SENHA, null)?.length}")
    }

    fun getToken(): String? = prefs.getString(KEY_TOKEN, null)
    fun getNome(): String? = prefs.getString(KEY_NOME, null)
    fun getCnpj(): String? = prefs.getString(KEY_CNPJ, null)
    fun getTelefone(): String? = prefs.getString(KEY_TELEFONE, null)
    fun getSenha(): String? = prefs.getString(KEY_SENHA, null)
    fun isLoggedIn(): Boolean = getToken() != null
    fun isLoggedOut(): Boolean = prefs.getBoolean(KEY_LOGGED_OUT, false)
    fun clearLoggedOut() {
        prefs.edit().remove(KEY_LOGGED_OUT).apply()
    }
    fun setLoggedOut(value: Boolean) {
        prefs.edit().putBoolean(KEY_LOGGED_OUT, value).apply()
    }
    fun isTokenExpired(): Boolean {
        val token = getToken() ?: return true
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return true
            val payload = String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_WRAP), Charsets.UTF_8)
            val json = org.json.JSONObject(payload)
            val exp = json.getLong("exp")
            (System.currentTimeMillis() / 1000) > exp
        } catch (e: Exception) {
            true
        }
    }

    fun clear() {
        prefs.edit().remove(KEY_TOKEN).remove(KEY_NOME).commit()
    }
    fun clearSenha() {
        prefs.edit().remove(KEY_SENHA).apply()
    }
}