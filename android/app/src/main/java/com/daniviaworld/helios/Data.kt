package com.daniviaworld.helios

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query

val POS_ORDER = listOf("POR", "DEF", "MED", "DEL")

data class Pl(val a: Long, val n: String, val t: String, val p: String, val v: Double)
data class Team(val c: String, val n: String)

data class Member(
    val uid: String,
    val name: String,
    val tot: Int,
    val j: Int,
    val value: Double,
    val cash: Double,
    val formation: String,
    val lineup: Map<String, List<Long?>>,
    val squad: List<Long>,
    val fav: String
)

data class MarketState(val end: Long, val round: Long, val values: Map<Long, Double>, val listings: List<Long>)
data class News(val id: String, val ts: Long, val kind: String, val text: String)

fun numD(x: Any?): Double = (x as? Number)?.toDouble() ?: 0.0
fun numL(x: Any?): Long? = (x as? Number)?.toLong()

/** Catálogo de jugadores y puntos de temporada (se carga una vez y se refresca cada pocos minutos). */
object Catalog {
    var players by mutableStateOf<Map<Long, Pl>>(emptyMap())
    var teams by mutableStateOf<Map<String, Team>>(emptyMap())
    var pts by mutableStateOf<Map<Long, Int>>(emptyMap())
    var loaded by mutableStateOf(false)
    var error by mutableStateOf("")
    private var busy = false

    fun load() {
        if (busy || loaded) return
        busy = true
        error = ""
        FirebaseFirestore.getInstance().collection("catalog").document("main").get()
            .addOnSuccessListener { d ->
                val pm = HashMap<Long, Pl>()
                val rawPlayers = d.get("players") as? List<*>
                if (rawPlayers != null) {
                    for (r in rawPlayers) {
                        val m = r as? Map<*, *> ?: continue
                        val a = numL(m["a"]) ?: continue
                        val p = m["p"] as? String ?: continue
                        if (p == "ENT") continue
                        pm[a] = Pl(a, m["n"] as? String ?: "?", m["t"] as? String ?: "", p, numD(m["v"]))
                    }
                }
                val tm = HashMap<String, Team>()
                val rawTeams = d.get("teams") as? List<*>
                if (rawTeams != null) {
                    for (r in rawTeams) {
                        val m = r as? Map<*, *> ?: continue
                        val c = m["c"] as? String ?: continue
                        tm[c] = Team(c, m["n"] as? String ?: c)
                    }
                }
                players = pm
                teams = tm
                loaded = pm.size >= 100
                if (!loaded) error = "El catálogo de jugadores está vacío."
                busy = false
                refreshPts()
            }
            .addOnFailureListener { e ->
                error = "No se pudieron cargar los jugadores: " + (e.message ?: "")
                busy = false
            }
    }

    fun refreshPts() {
        FirebaseFirestore.getInstance().collection("points").document("season").get()
            .addOnSuccessListener { d ->
                val out = HashMap<Long, Int>()
                val pl = d.get("pl") as? Map<*, *>
                if (pl != null) {
                    for ((k, v) in pl) {
                        val a = (k as? String)?.toLongOrNull() ?: continue
                        val j = (v as? Map<*, *>)?.get("j") as? Map<*, *> ?: continue
                        var t = 0
                        for (x in j.values) t += (x as? Number)?.toInt() ?: 0
                        out[a] = t
                    }
                }
                pts = out
            }
    }

    fun teamName(code: String): String = teams[code]?.n ?: code
}

/** Datos en vivo de una liga: mánagers, mercado, pujas y actividad. */
class LeagueStore(val leagueId: String, val uid: String) {
    var members by mutableStateOf<List<Member>>(emptyList())
    var membersLoaded by mutableStateOf(false)
    var market by mutableStateOf<MarketState?>(null)
    var marketLoaded by mutableStateOf(false)
    var news by mutableStateOf<List<News>>(emptyList())
    var myBids by mutableStateOf<Map<Long, Double>>(emptyMap())
    var myBidsRound by mutableStateOf(-1L)
    var error by mutableStateOf("")
    private val regs = mutableListOf<ListenerRegistration>()

    private fun leagueRef() = FirebaseFirestore.getInstance().collection("leagues").document(leagueId)

    fun start() {
        val ref = leagueRef()
        regs.add(ref.collection("members").addSnapshotListener { snap, e ->
            if (e != null) {
                error = "No se pudieron cargar los mánagers."
                return@addSnapshotListener
            }
            members = snap?.documents?.map { parseMember(it) } ?: emptyList()
            membersLoaded = true
        })
        regs.add(ref.collection("market").document("state").addSnapshotListener { d, e ->
            if (e == null) {
                market = if (d != null && d.exists()) parseMarket(d) else null
                marketLoaded = true
            }
        })
        regs.add(ref.collection("bids").document(uid).addSnapshotListener { d, e ->
            if (e == null) {
                val out = HashMap<Long, Double>()
                val bm = d?.get("bids") as? Map<*, *>
                if (bm != null) {
                    for ((k, v) in bm) {
                        val a = (k as? String)?.toLongOrNull() ?: continue
                        out[a] = numD(v)
                    }
                }
                myBids = out
                myBidsRound = numL(d?.get("round")) ?: -1L
            }
        })
        regs.add(ref.collection("news").orderBy("ts", Query.Direction.DESCENDING).limit(120)
            .addSnapshotListener { snap, e ->
                if (e == null) {
                    val list = ArrayList<News>()
                    snap?.documents?.forEach { d ->
                        val to = d.getString("to")
                        if (to != null && to != uid) return@forEach
                        list.add(News(d.id, numL(d.get("ts")) ?: 0L, d.getString("k") ?: "fichaje", d.getString("x") ?: ""))
                    }
                    news = list
                }
            })
    }

    fun stop() {
        regs.forEach { it.remove() }
        regs.clear()
    }

    /** Guarda las pujas del mercado actual (mismo formato que la web). */
    fun saveBids(bids: Map<Long, Double>, round: Long, onDone: (String?) -> Unit) {
        val ref = leagueRef()
        val bm = HashMap<String, Any>()
        for ((a, v) in bids) bm[a.toString()] = v
        val doc1 = hashMapOf<String, Any>("uid" to uid, "round" to round, "bids" to bm)
        val doc2 = hashMapOf<String, Any>("uid" to uid, "round" to round, "ids" to bids.keys.toList())
        ref.collection("bids").document(uid).set(doc1)
            .addOnSuccessListener {
                ref.collection("bidpub").document(uid).set(doc2)
                onDone(null)
            }
            .addOnFailureListener { e -> onDone(e.message ?: "No se pudo guardar la puja") }
    }
}

fun parseMember(d: DocumentSnapshot): Member {
    val lu = HashMap<String, List<Long?>>()
    val l = d.get("lineup") as? Map<*, *>
    for (pos in POS_ORDER) {
        val arr = l?.get(pos) as? List<*>
        lu[pos] = arr?.map { numL(it) } ?: emptyList()
    }
    val sq = (d.get("squad") as? List<*>)?.mapNotNull { numL(it) } ?: emptyList()
    return Member(
        uid = d.id,
        name = d.getString("name") ?: "Mánager",
        tot = numD(d.get("tot")).toInt(),
        j = numD(d.get("j")).toInt(),
        value = numD(d.get("val")),
        cash = numD(d.get("cash")),
        formation = d.getString("formation") ?: "",
        lineup = lu,
        squad = sq,
        fav = d.getString("fav") ?: ""
    )
}

fun parseMarket(d: DocumentSnapshot): MarketState {
    val vals = HashMap<Long, Double>()
    val vm = d.get("values") as? Map<*, *>
    if (vm != null) {
        for ((k, v) in vm) {
            val a = (k as? String)?.toLongOrNull() ?: continue
            vals[a] = numD(v)
        }
    }
    val ls = (d.get("listings") as? List<*>)?.mapNotNull { numL(it) } ?: emptyList()
    return MarketState(numL(d.get("end")) ?: 0L, numL(d.get("round")) ?: 0L, vals, ls)
}
