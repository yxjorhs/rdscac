# rdscac
cache data by Redis simply and auto refresh cache base on event mod



# usage

```typescript
import redis from 'redis';
import RdsCac from 'rdscac';

const rdscac = new RdsCac({
    redis,
    expireIn: 86400,
    unique: ''
})

// refresh cache by forceRefresh
async function data1Get(forceRefresh: boolean) {
    return rdscac.get(
        'key1',
        async () => {
            return 'helloworld'
        },
        forceRefresh,
    )
}

// refresh cache by event mod
async function data2Get() {
    return rdscac.bindEvGet(
        'key2',
        async () => {
          return Date.now()
        },
        // cache will be refresh when call rdscat.refreshByEv(['refreshEvent'])
        ['refreshEvent'],
    )
}
```

