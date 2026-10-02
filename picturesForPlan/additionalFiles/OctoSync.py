
import pyodbc
from zk import ZK
import time
import os
from datetime import datetime

ZK_IP = '192.168.1.200'
ZK_PORT = 4370

DB_PATH = r'\\192.168.1.100\Administration\00-Octo-DB\Octo_Attendance.accdb'

conn_str = (
    r'DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};'
    r'DBQ=' + DB_PATH + ';'
)

LOG_FILE = "octosync_log.txt"

def write_log(message):
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now()} - {message}\n")

def sync_attendance():
    zk = ZK(ZK_IP, port=ZK_PORT, timeout=10)

    conn = None
    zk_conn = None

    try:
        write_log("Connecting to database...")
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()

        write_log("Connecting to fingerprint device...")
        zk_conn = zk.connect()

        attendances = zk_conn.get_attendance()

        inserted = 0

        for att in attendances:
            badge_id = str(att.user_id)
            log_time = att.timestamp

            check_sql = """
                SELECT COUNT(*) 
                FROM RawLogs 
                WHERE BadgeID = ? AND LogTime = ?
            """

            cursor.execute(check_sql, (badge_id, log_time))

            exists = cursor.fetchone()[0]

            if exists == 0:
                insert_sql = """
                    INSERT INTO RawLogs (BadgeID, LogTime)
                    VALUES (?, ?)
                """

                cursor.execute(insert_sql, (badge_id, log_time))
                inserted += 1

        conn.commit()

        write_log(f"Sync completed. New logs inserted: {inserted}")

    except Exception as e:
        write_log(f"ERROR: {str(e)}")

    finally:
        try:
            if zk_conn:
                zk_conn.disconnect()
        except:
            pass

        try:
            if conn:
                conn.close()
        except:
            pass

if __name__ == "__main__":

    write_log("OctoSync service started.")

    while True:
        sync_attendance()
        time.sleep(30)
